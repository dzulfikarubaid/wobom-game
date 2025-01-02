import express, { response } from "express";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from 'http';
import { fileURLToPath } from "url";
import path from "path";
import { PORT } from "./utilities/secureData.js";
import routes from "./routes/userRoutes.js";
import cookieParser from "cookie-parser";

const app = express();
const server = createServer(app);  // Ensure you're using 'server' for listen
const io = new Server(server, {
    cors: {
        origin: "https://wobom-game.vercel.app",  // Allow frontend to connect
        methods: ["GET", "POST"],
        credentials: true,
    },
    addTrailingSlash: false
});

const users = {};  // Store usernames with their socket ids
const rooms = [];  // Store room names
let usersInRoomMap = {};
let usersInRooms = {};
// Socket.io connection
let countdown = 10;
let intervalId = null;

function startCountdown(room, usersInGame,) {
    let interval = setInterval(() => {
        if (countdown > 0) {
            countdown--;
            io.emit("countdown", countdown); // Kirim update countdown ke semua klien
        } else {
            clearInterval(interval);
            onCountdownEnd(room, usersInGame);
        }
    }, 1000);
}

// Fungsi yang dijalankan setelah countdown selesai
function onCountdownEnd(room, usersInGame) {
    const user = usersInGame.find(u => u.username === activeUser);
    if (user) {
        user.lifes -= 1;  // Kurangi nyawa pemain
        io.emit("updated-life", {
            usersInGame,  // Kirim status pemain terbaru ke 
        });
    }
}
io.on("connection", (socket) => {
    console.log(`User ${socket.id} connected`);
    let currentRoom = null;  // Track current room
    socket.on("end-game", (data) => {
        console.log("Game ended")
        io.to(data.urlPath).emit("ended-game", data.activeUser);
    }
    );
        
    socket.on("start-game", (room, username, callback) => {
        const users = usersInRooms[room];
        if (users) {
            // Emit pesan untuk memulai permainan ke seluruh pengguna dalam ruangan
            io.to(room).emit("started-game", { status: true })
            const usersInGame = users.map(user => {
                return { username: user, lifes: 2 };
            });
            console.log(usersInGame)
            
            callback({ success: true, message: "Game started", usersInGame: usersInGame });
        } else {
            callback({ success: false, message: "Room not found" });
        }
    });
    socket.on('countdown-end', ({ urlPath, activeUser }) => {
        // Temukan pengguna dalam game dan kurangi nyawanya
        const user = usersInRooms[urlPath].find(u => u.username === activeUser);
        if (user) {
            user.lifes -= 1;
            io.to(urlPath).emit("updated-life", { username: activeUser, lifes: user.lifes });

            if (user.lifes <= 0) {
                // Kirim event game over
                io.to(urlPath).emit("game-over", activeUser);
            }
        }
    });

    // Contoh di server (Node.js + socket.io)
    socket.on('sync', (data) => {
        io.to(data.urlPath).emit('sync-state', data);
    });
    socket.on("update-life", (data) => {
        // Update status life untuk semua pengguna
        io.to(data.urlPath).emit("sync-life", data);
    });



    socket.on("add-room", (room, username, callback) => {
        // Jika room belum ada, buat array kosong untuk menampung usernames
        socket.join(room);
        let usersAmount = usersInRooms[room]?.length || 0
        if(usersAmount === 2 && !usersInRooms[room].includes(username)){
            callback({ success: false, message: "Room is full" });
            return
            
        }
        if (!usersInRooms[room]) {
            usersInRooms[room] = [username];
        } else if (!usersInRooms[room].includes(username)) {
            usersInRooms[room].push(username);
        }
        console.log(usersInRooms);
        io.to(room).emit('update-users-in-room', usersInRooms);
        // Kirim objek usersInRooms ke frontend
        callback({ success: true, usersInRooms: usersInRooms });
    });
    socket.on("remove-room", (room, username, callback) => {
        socket.leave(room);
        if (usersInRooms[room] && usersInRooms[room].includes(username)) {
            usersInRooms[room].splice(usersInRooms[room].indexOf(username), 1);
            callback({ success: true, usersInRooms: usersInRooms });
        } else {
            callback({ success: false, message: "Room or username not found" });
        }
        io.to(room).emit('update-users-in-room', usersInRooms);
    });
    socket.on("get-users-in-rooms", (callback) => {
        for (let room in usersInRooms) {
            if (usersInRooms[room].length === 0) {
                delete usersInRooms[room];
            }
        }
        callback({ success: true, usersInRooms: usersInRooms });
    });

    // Handle setting the username
    socket.on('set-username', (username) => {
        if (Object.values(users).includes(username)) {
            return;  // Prevent duplicate usernames
        } else {
            users[socket.id] = username;
        }
        console.log(`Username set for ${socket.id}: ${username}`);
    });

    // Get available rooms
    socket.on("get-rooms", (callback) => {
        callback({ success: true, rooms: rooms });
    });
    socket.on("input-value", (data) => {
        io.to(data.urlPath).emit("sync-input", data);
    });
    // Handle user joining a room
    // Server: Handle user joining a room
    socket.on("join-room", (room, username, callback) => {
        if (currentRoom) {
            socket.leave(currentRoom);  // Leave the previous room if any
        }

        // Join the new room
        socket.join(room);
        currentRoom = room;  // Track the current room
        usersInRoomMap[socket.id] = username;

        // Emit updated user list in the room
        const roomSockets = io.sockets.adapter.rooms.get(room);
        const userSockets = Array.from(roomSockets);
        io.to(room).emit("users-updated", userSockets);

        // If the room doesn't exist yet, add it
        if (!rooms.includes(room)) {
            rooms.push(room);
            console.log(`User ${username} created room: ${room}`);
            io.to(room).emit('update-users-in-room', getUsersInRoom(room));
            callback({ success: true, room: currentRoom });
        } else {
            console.log(`User ${username} joined room: ${room}`);
            io.to(room).emit('update-users-in-room', getUsersInRoom(room));
            callback({ success: true, message: `Joined room ${room}`, room: currentRoom });
        }
    });


    // Server: Handling user leaving the room
    socket.on("leave-room", (roomToLeave, callback) => {
        console.log(`User ${socket.id} leaving room: ${roomToLeave}`);

        if (roomToLeave) {
            // User leaves the current room
            socket.leave(roomToLeave);
            console.log(`User ${socket.id} left room: ${roomToLeave}`);

            // Delete user from usersInRoomMap
            delete usersInRoomMap[socket.id];

            // Get the updated list of users in the room
            const roomSockets = io.sockets.adapter.rooms.get(roomToLeave);
            const userSockets = roomSockets ? Array.from(roomSockets) : [];

            // If the room is empty, remove it from the rooms list
            if (userSockets.length === 0) {
                let index = rooms.indexOf(roomToLeave);
                if (index !== -1) {
                    rooms.splice(index, 1); // Remove the empty room
                    console.log(`Room ${roomToLeave} has been removed from the list.`);
                }
            }

            // Emit updated users list in room (after the user leaves)
            io.to(roomToLeave).emit("users-updated", userSockets);

            // Emit global update for users in all rooms (optional)
            io.emit('update-users-in-room', getUsersInRoom());

            callback({ success: true, message: "Left room successfully!" });
        } else {
            callback({ success: false, message: "No room to leave." });
        }
    });



    // Handle user disconnect
    socket.on("disconnect", () => {
        for (let room in usersInRooms) {
            if (usersInRooms[room].length === 0) {
                delete usersInRooms[room];
            }
        }
        console.log(`User ${socket.id} disconnected`);
    });

    // Handle getting all users in a room (for initial fetch)
    socket.on("get-users-in-room", (room, callback) => {
        const usersInRoom = getUsersInRoom(room);  // Mengambil daftar pengguna dari fungsi terpisah
        if (usersInRoom.length > 0) {
            callback({ success: true, users: usersInRoom });
        } else {
            callback({ success: false, message: `Room ${room} not found` });
        }
    });

});
function getUsersInRoom(room) {
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (!roomSockets) return [];

    // Ambil semua socketId dalam room dan map ke username
    return Array.from(roomSockets).map(socketId => {
        return usersInRoomMap[socketId] || 'Anonymous';  // Menggunakan username dari usersInRoomMap atau 'Anonymous' jika tidak ada
    });
}


// Middleware
app.use(express.json());  // Pastikan ini ada, untuk mem-parsing JSON body
app.use(cookieParser());  // Untuk mem-parsing cookies, jika digunakan
app.use(cors({
    credentials: true,
    origin: ['http://localhost:5173', 'https://wobom-game.vercel.app'],
}));
const __dirname = path.dirname(fileURLToPath(import.meta.url)); 
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "dist", "index.html"));
});
app.use("/api", routes)

server.listen(PORT, () => { 
    console.log("Server is running on http://localhost:5001");
});
