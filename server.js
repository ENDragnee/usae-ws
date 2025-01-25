import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import os from "os";
import { MongoClient } from "mongodb";

const app = express();
const PORT = 3000;

// MongoDB Connection URI
const uri = "mongodb+srv://mesfinmastwal:YHujuacgO6NCOhvc@cluster0.imcf4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);
const dbName = "usae-sport";
let db;
let playersCollection;

// Connect to MongoDB
async function connectToMongo() {
  try {
    await client.connect();
    db = client.db(dbName);
    playersCollection = db.collection("Players");
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}
connectToMongo();

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for groups
let groups = Array(16)
  .fill(null)
  .map(() => Array(3).fill("Team"));

// Function to convert index to letter (0 = A, 1 = B, etc.)
function indexToLetter(index) {
  return String.fromCharCode(65 + index);
}

// Function to generate a unique ID
function generateUniqueId() {
  return Date.now().toString();
}

// Function to update MongoDB with player data
async function updatePlayerInDB(groupIndex, slotIndex, value) {
  try {
    const playerData = {
      UniID: generateUniqueId(),
      Name: value,
      Group: indexToLetter(groupIndex),
      Slot: (slotIndex + 1).toString(),
      isTeam: true,
      playerList: [], // You may want to modify this based on your requirements
      Type: "Football", // Default value
      Status: "Pending" // Default value
    };

    await playersCollection.insertOne(playerData);
    console.log("Player added to database:", playerData);
  } catch (error) {
    console.error("Error updating database:", error);
  }
}

// REST API Endpoints remain the same
app.get("/api/groups", (req, res) => {
  res.json({ groups });
});

app.post("/api/update-slot", async (req, res) => {
  const { groupIndex, slotIndex, value } = req.body;

  if (
    groupIndex >= 0 &&
    groupIndex < groups.length &&
    slotIndex >= 0 &&
    slotIndex < groups[groupIndex].length
  ) {
    groups[groupIndex][slotIndex] = value;
    await updatePlayerInDB(groupIndex, slotIndex, value);
    broadcast({ type: "UPDATE_GROUPS", data: groups });
    res.json({ groups });
  } else {
    res.status(400).json({ message: "Invalid group index or slot index" });
  }
});

// Other REST endpoints remain the same...

// WebSocket handling
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

wss.on("connection", (ws) => {
  console.log("WebSocket client connected.");

  ws.send(JSON.stringify({ type: "INITIAL_DATA", data: groups }));

  ws.on("message", async (message) => {
    const data = JSON.parse(message);

    if (data.type === "UPDATE_SLOT") {
      const { groupIndex, slotIndex, value } = data;

      if (
        groupIndex >= 0 &&
        groupIndex < groups.length &&
        slotIndex >= 0 &&
        slotIndex < groups[groupIndex].length
      ) {
        groups[groupIndex][slotIndex] = value;
        await updatePlayerInDB(groupIndex, slotIndex, value);
        broadcast({ type: "UPDATE_GROUPS", data: groups });
      }
    }
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected.");
  });
});

// Utility function to get the local IP address
function getLocalIP() {
  const networkInterfaces = os.networkInterfaces();
  for (const interfaceName in networkInterfaces) {
    const network = networkInterfaces[interfaceName];
    for (const config of network) {
      if (config.family === "IPv4" && !config.internal) {
        return config.address;
      }
    }
  }
  return "localhost";
}

// Clean up MongoDB connection on server shutdown
process.on('SIGINT', async () => {
  try {
    await client.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    process.exit(1);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://${getLocalIP()}:${PORT}`);
});