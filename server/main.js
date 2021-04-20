"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
console.log("importing packages...");
const sqlite3 = require("sqlite3").verbose();
const sqlite = require("sqlite");
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
    }
});
let root = __dirname.slice(0, __dirname.length - 6);
const timerOffset = 0;
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield sqlite.open({
            filename: "./server/database.db",
            driver: sqlite3.Database
        });
        yield db.get(`CREATE TABLE IF NOT EXISTS games(
        id INTEGER PRIMARY KEY,
        code TEXT,
        state TEXT,
        host TEXT,
        duration INTEGER,
        diff TEXT,
        maxPlayers INTEGER,
        startTime INTEGER,
        word TEXT
    )`);
        yield db.run(`CREATE TABLE IF NOT EXISTS players(
        id TEXT,
        gameId INTEGER,
        name VARCHAR(10),
        playAgain NUMERIC
    )`);
        yield db.run(`CREATE TABLE IF NOT EXISTS playersWords(
        playerId TEXT,
        word VARCHAR(40)
    )`);
        yield db.run("DELETE FROM games");
        yield db.run("DELETE FROM players");
        yield db.run("DELETE FROM playersWords");
        io.on("connection", (socket) => {
            socket.on("host", (data) => __awaiter(this, void 0, void 0, function* () {
                yield hostHandler(data, socket, db);
            }));
            socket.on("join", (data) => __awaiter(this, void 0, void 0, function* () {
                yield joinHandler(data, socket, db);
            }));
            socket.on("startGame", (data) => __awaiter(this, void 0, void 0, function* () {
                yield startGameHandler(data, socket, db);
            }));
            socket.on("addWord", (data) => __awaiter(this, void 0, void 0, function* () {
                yield addWordHandler(data, socket, db);
            }));
            socket.on("playAgain", (data) => __awaiter(this, void 0, void 0, function* () {
                yield playAgainHandler(data, socket, db);
            }));
            socket.on("leave", (data) => {
                disconnect(socket.id, db);
            });
            socket.on("disconnect", (data) => {
                disconnect(socket.id, db);
            });
        });
    });
}
let port = process.env.PORT || 3000;
http.listen(port, () => {
    console.log(`listening on *:${port}`);
});
start();
app.get('/', (req, res) => {
    let root = __dirname.slice(0, __dirname.length - 6);
    res.sendFile(root + '/client/index.html');
});
app.get('/style.css', (req, res) => {
    res.sendFile(root + '/client/style/style.css');
});
app.get('/general.css', (req, res) => {
    res.sendFile(root + '/client/style/general.css');
});
app.get('/main.js', (req, res) => {
    res.sendFile(root + '/client/main.js');
});
app.get('/favicon.ico', (req, res) => {
    res.sendFile(root + '/client/assets/favicon.ico');
});
app.get('/crown.png', (req, res) => {
    res.sendFile(root + '/client/assets/crown2.png');
});
app.get('/min.css', (req, res) => {
    res.sendFile(root + '/client/style.min.css');
});
const nameVefication = /[^a-zA-Z0-9 ]/;
function addWordHandler(data, socket, db) {
    return __awaiter(this, void 0, void 0, function* () {
        let player = yield db.get("SELECT * FROM players WHERE id = ?", socket.id);
        if (!player) {
            socket.emit("addWordError", { message: "You are not in a game" });
            return;
        }
        let game = yield db.get("SELECT * FROM games WHERE id = ?", [player.gameId]);
        if (game.state !== "started") {
            socket.emit("addWordError", { message: "The game is not active." });
            return;
        }
        if (!checkMatchingWord(data.word, game.word)) {
            socket.emit("wordResult", {
                correct: false,
                word: data.word,
                message: "The word's letters are not matching the given word's letters"
            });
            return;
        }
        let word = yield db.get("SELECT * FROM words WHERE word = ?", data.word);
        if (!word) {
            socket.emit("wordResult", {
                correct: false,
                word: data.word,
                message: "The word does not exists in the words stockpile"
            });
            return;
        }
        let wordDuplicate = yield db.get("SELECT word FROM playersWords WHERE playerId = ? AND word = ?", [socket.id, data.word]);
        if (wordDuplicate) {
            socket.emit("wordResult", {
                correct: false,
                word: data.word,
                message: "You already wrote this word"
            });
            return;
        }
        yield db.run("INSERT INTO playersWords(playerId, word) VALUES (?, ?)", [socket.id, data.word]);
        socket.emit("wordResult", {
            correct: true,
            word: data.word
        });
    });
}
function checkMatchingWord(word, matchingWord) {
    let remainingLetters = matchingWord.split("");
    for (let i = 0; i < word.length; i++) {
        if (remainingLetters.includes(word[i])) {
            remainingLetters.splice(remainingLetters.indexOf(word[i]), 1);
        }
        else {
            return false;
        }
    }
    return true;
}
function disconnect(socketId, db) {
    return __awaiter(this, void 0, void 0, function* () {
        yield db.run("DELETE FROM playersWords WHERE playerId = ?", [socketId]);
        let player = yield db.get("SELECT * FROM players WHERE id = ?", [socketId]);
        if (player) {
            yield db.run("DELETE FROM players WHERE id = ?", [socketId]);
            if (io.sockets.sockets[socketId]) {
                io.sockets.sockets[socketId].leave(player.gameId);
            }
            let players = yield db.all("SELECT * FROM players WHERE gameId = ?", [player.gameId]);
            if (players.length === 0) {
                yield db.run("DELETE FROM games WHERE id = ?", [player.gameId]);
            }
            else {
                let game = yield db.get("SELECT * FROM games WHERE id = ?", [player.gameId]);
                if (game.host === socketId) {
                    yield db.run("UPDATE games SET host = ? WHERE id = ?", [players[0].id, game.id]);
                }
                console.log("playerLeft");
                io.to(player.gameId).emit("playerLeft", { name: player.name, host: players[0].name });
            }
        }
    });
}
function endGame(game, db) {
    return __awaiter(this, void 0, void 0, function* () {
        let players = yield db.all(" SELECT * FROM players WHERE gameId = ?", game.id);
        let results = { scores: [] };
        let words = {};
        for (let i = 0; i < players.length; i++) {
            words[players[i].id] = { words: [], name: players[i].name };
            let playerWords = yield db.all("SELECT word FROM playersWords WHERE playerId = ?", [players[i].id]);
            for (let j = 0; j < playerWords.length; j++) {
                words[players[i].id].words.push(playerWords[j].word);
            }
        }
        for (let player in words) {
            let points = 0;
            for (let i = 0; i < words[player].words.length; i++) {
                let unique = true;
                for (let otherPlayer in words) {
                    if (player === otherPlayer) {
                        continue;
                    }
                    for (let j = 0; j < words[otherPlayer].words.length; j++) {
                        if (words[otherPlayer].words[j] === words[player].words[i]) {
                            unique = false;
                            break;
                        }
                    }
                }
                if (unique) {
                    points += 10;
                }
                else {
                    points += 5;
                }
            }
            results.scores.push({
                name: words[player].name,
                score: points
            });
        }
        results.scores.sort((a, b) => {
            return b.score - a.score;
        });
        yield db.run("UPDATE games SET state = 'ended' WHERE id = ?", [game.id]);
        io.to(game.id).emit("ended", results);
        for (let player in words) {
            disconnect(player, db);
        }
    });
}
function hostHandler(data, socket, db) {
    return __awaiter(this, void 0, void 0, function* () {
        let player = yield db.get("SELECT * FROM players WHERE id = ?", [socket.id]);
        if (player) {
            socket.emit("hostGameError", { message: "this client is already in a game." });
            return;
        }
        let name;
        if (typeof data.name === "string") {
            name = data.name.trim();
            if (name.length > 10 || name.length < 2) {
                socket.emit("hostGameError", { message: "The name length is not in the range of 2 - 10." });
                return;
            }
            if (nameVefication.test(name)) {
                socket.emit("hostGameError", { message: "The name must only have letters, digits or spaces." });
                return;
            }
        }
        else {
            socket.emit("hostGameError", { message: "The name is not a string." });
            return;
        }
        let diff;
        if (typeof data.diff === "string") {
            diff = data.diff;
            if (!(diff === "hard" || diff === "normal" || diff === "easy")) {
                socket.emit("hostGameError", { message: "The difficulty is not hard normal or easy" });
                return;
            }
        }
        else {
            socket.emit("hostGameError", { message: "The difficulty is not a string" });
            return;
        }
        let maxPlayers;
        if (typeof data.maxPlayers === "number") {
            maxPlayers = data.maxPlayers;
            if (maxPlayers > 10 || maxPlayers < 2) {
                socket.emit("hostGameError", { message: "The maxPlayers is not in range of 2 - 10" });
                return;
            }
        }
        else {
            socket.emit("hostGameError", { message: "The maxPlayer is not a number" });
            return;
        }
        let duration;
        if (typeof data.duration === "number") {
            duration = data.duration;
            if (duration > 10 || duration < 2) {
                socket.emit("hostGameError", { message: "The duration is not in range of 2 - 10" });
                return;
            }
        }
        else {
            socket.emit("hostGameError", { message: "The duration is not a number" });
            return;
        }
        let code = makeCode(5);
        let result = yield db.get("SELECT * FROM games WHERE code = ?", [code]);
        while (result) {
            let code = makeCode(5);
            let result = yield db.get("SELECT * FROM games WHERE code = ?", [code]);
        }
        let word = yield db.get("SELECT word FROM diff WHERE diff = ? ORDER BY RANDOM() LIMIT 1", [diff]);
        yield db.run(`INSERT INTO games(code, state, host, duration, diff, maxPlayers, word) VALUES
        (?, 'waiting', ?, ?, ?, ?, ?);`, [code, socket.id, duration, diff, maxPlayers, word.word]);
        let game = yield db.get(`SELECT * FROM games WHERE code = ?`, [code]);
        socket.join(game.id);
        db.run(`INSERT INTO players(id, gameId, name) VALUES (?, ?, ?)`, [socket.id, game.id, name]);
        socket.emit("gameCreated", {
            code,
            maxPlayers,
            diff,
            duration
        });
    });
}
function makeCode(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}
function joinHandler(data, socket, db) {
    return __awaiter(this, void 0, void 0, function* () {
        let player = yield db.get("SELECT * FROM players WHERE id = ?", [socket.id]);
        if (player) {
            socket.emit("joinGameError", { message: "this client is already in a game" });
            return;
        }
        let name;
        if (typeof data.name === "string") {
            name = data.name.trim();
            if (name.length > 10 || name.length < 2) {
                socket.emit("joinGameError", { message: "The name length is not in the range of 2 - 10." });
                return;
            }
            if (nameVefication.test(name)) {
                socket.emit("joinGameError", { message: "The name must only have letters, digits or spaces." });
                return;
            }
        }
        else {
            socket.emit("joinGameError", { message: "The name is not a string." });
            return;
        }
        let game;
        if (typeof data.code === "string") {
            let code = data.code;
            game = yield db.get("SELECT * FROM games WHERE code = ?", [code]);
            if (!game) {
                socket.emit("joinGameError", { message: "The game you tried to join does not exist." });
                return;
            }
        }
        if (game.state !== "waiting") {
            socket.emit("joinGameError", { message: "The game you tried to join already started." });
            return;
        }
        let players = yield db.all("SELECT * FROM players WHERE gameId = ?", [game.id]);
        if (players.length === game.maxPlayers) {
            socket.emit("joinGameError", { message: "The game you tried to join is full" });
            return;
        }
        let playerNames = [name];
        for (let i = 0; i < players.length; i++) {
            if (players[i].name === name) {
                socket.emit("joinGameError", { message: "The game you tried to join already has a player with the same name" });
                return;
            }
            playerNames.push(players[i].name);
        }
        db.run("INSERT INTO players(id, gameId, name) VALUES (? ,? ,?)", [socket.id, game.id, name]);
        let host = yield db.get("SELECT name FROM players WHERE id = ?", [game.host]);
        io.to(game.id).emit("playerJoined", { name });
        socket.join(game.id);
        socket.emit("joinedGame", {
            players: playerNames,
            diff: game.diff,
            duration: game.duration,
            maxPlayers: game.maxPlayers,
            code: game.code,
            host: host.name
        });
    });
}
function playAgainHandler(data, socket, db) {
    return __awaiter(this, void 0, void 0, function* () {
        const player = yield db.get("SELECT * FROM players WHERE id = ?", [socket.id]);
        if (!player) {
            socket.emit("playAgainError", { message: "The player does not exist." });
            return;
        }
        const game = yield db.get("SELECT * FROM games WHERE id = ?", [player.gameId]);
        const players = yield db.all("SELECT * FROM players WHERE gameId = ?", [game.id]);
        let playerNames = [];
        for (let i = 0; i < players.length; i++) {
            playerNames.push(players[i].name);
        }
        if (game.state === "started") {
            socket.emit("playAgainError", { message: "The game is active." });
            return;
        }
        if (game.state === "ended") {
            db.run("UPDATE games SET state = 'waiting' WHERE id = ?", [game.id]);
        }
        if (player.id === game.host) {
            socket.emit("gameCreated", {
                code: game.code,
                maxPlayers: game.maxPlayers,
                diff: game.diff,
                duration: game.duration
            });
            for (let i = 0; i < players.length; i++) {
                if (players[i].playAgain === 1 && players[i].id !== game.host) {
                    io.to(players[i].id).emit("joinedGame", {
                        players: playerNames,
                        diff: game.diff,
                        duration: game.duration,
                        maxPlayers: game.maxPlayers,
                        code: game.code,
                        host: player.name
                    });
                }
            }
        }
        else {
            if (players.length < game.maxPlayers) {
                socket.emit("playAgainError", { message: "Tha game is full." });
                return;
            }
            for (let i = 0; i < players.length; i++) {
                if (players[i].name === player.name && player.playAgain === 1) {
                    socket.emit("playAgainError", { message: "You can not play again with this name since there is already a player with the same name." });
                    return;
                }
            }
            let host = yield db.get("SELECT * FROM players WHERE id = ?", [game.host]);
            if (host.playAgain === 1) {
                socket.emit("joinedGame", {
                    players: playerNames,
                    diff: game.diff,
                    duration: game.duration,
                    maxPlayers: game.maxPlayers,
                    code: game.code,
                    host: host.name
                });
            }
            else {
                socket.emit("waitingForHost", { message: "Waiting for the host..." });
            }
        }
    });
}
function startGameHandler(data, socket, db) {
    return __awaiter(this, void 0, void 0, function* () {
        let game = yield db.get("SELECT * FROM games WHERE host = ?", [socket.id]);
        if (!game) {
            socket.emit("startGameError", { message: "You are not host in a game" });
            return;
        }
        if (game.state !== "waiting") {
            socket.emit("startGameError", { message: "The game already started" });
            return;
        }
        let gameId = game.id;
        let players = yield db.all("SELECT * FROM Players WHERE gameId = ?", [game.id]);
        if (players.length === 1) {
            socket.emit("startGameError", { message: "You can not start the game with only 1 player" });
            return;
        }
        db.run("UPDATE games SET state = 'started' WHERE host = ?", [socket.id]);
        db.run("UPDATE games SET startTime = ? WHERE host = ?", [Math.floor(Date.now() / 1000), socket.id]);
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            let game = yield db.get("SELECT * FROM games WHERE id = ?", [gameId]);
            endGame(game, db);
        }), (game.duration * 60 + timerOffset) * 1000);
        io.to(game.id).emit("gameStarted", {
            word: game.word,
            duration: game.duration
        });
    });
}
