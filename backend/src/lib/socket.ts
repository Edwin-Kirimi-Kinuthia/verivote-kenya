import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HttpServer, allowedOrigins: string[]) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`🔌 Socket client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function emitVoteUpdate(payload: {
  totalVotes: number;
  turnout: number;
  lastVoteAt: string;
}) {
  io?.emit('vote:update', payload);
}

export function emitDistressAlert(payload: {
  serial: string;
  stationName: string;
  stationCode: string;
  timestamp: string;
}) {
  io?.emit('distress:alert', payload);
}
