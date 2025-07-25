import { WebSocketServer } from 'ws';
import express from 'express';
import http from 'http';

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 8080;

// 启用CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 创建WebSocket服务器
const wss = new WebSocketServer({ server });

// 房间管理
const rooms = new Map();

// 心跳检测
const heartbeatInterval = 30000; // 30秒

wss.on('connection', (ws) => {
  console.log('新的客户端连接');
  
  let currentRoom = null;
  let heartbeat = setInterval(() => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  }, heartbeatInterval);
  
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'create':
          handleCreateRoom(ws, message.roomId);
          currentRoom = message.roomId;
          break;
          
        case 'join':
          handleJoinRoom(ws, message.roomId);
          currentRoom = message.roomId;
          break;
          
        case 'signal':
          if (currentRoom) {
            forwardSignal(ws, currentRoom, message.data);
          }
          break;
          
        default:
          console.warn('未知消息类型:', message.type);
      }
    } catch (error) {
      console.error('消息处理错误:', error);
    }
  });
  
  ws.on('close', () => {
    clearInterval(heartbeat);
    if (currentRoom) {
      cleanupRoom(currentRoom, ws);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket错误:', error);
  });
});

// 房间处理函数
function handleCreateRoom(ws, roomId) {
  if (rooms.has(roomId)) {
    return ws.send(JSON.stringify({
      type: 'error',
      message: '房间已存在'
    }));
  }
  
  rooms.set(roomId, new Set([ws]));
  ws.send(JSON.stringify({
    type: 'roomCreated',
    roomId
  }));
}

function handleJoinRoom(ws, roomId) {
  const room = rooms.get(roomId);
  
  if (!room) {
    return ws.send(JSON.stringify({
      type: 'error',
      message: '房间不存在'
    }));
  }
  
  if (room.size >= 2) {
    return ws.send(JSON.stringify({
      type: 'error',
      message: '房间已满'
    }));
  }
  
  room.add(ws);
  ws.send(JSON.stringify({
    type: 'roomJoined',
    roomId
  }));
  
  // 通知其他玩家有新玩家加入
  room.forEach(client => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'peerJoined'
      }));
    }
  });
}

function forwardSignal(sender, roomId, data) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'signal',
        data
      }));
    }
  });
}

function cleanupRoom(roomId, ws) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.delete(ws);
  
  if (room.size === 0) {
    rooms.delete(roomId);
  } else {
    // 通知剩余玩家有玩家离开
    room.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'peerDisconnected'
        }));
      }
    });
  }
}

// 启动服务器
server.listen(port, () => {
  console.log(`服务器已启动，端口: ${port}`);
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});