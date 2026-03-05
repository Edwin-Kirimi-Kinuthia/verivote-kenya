import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3005';
    socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });
  }
  return socket;
}
