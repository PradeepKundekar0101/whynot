import { Server } from "socket.io";

let ioInstance: Server | null = null;

export function setIO(io: Server) {
  ioInstance = io;
}

export function getIO(): Server | null {
  return ioInstance;
}

export function emitToStream(streamId: string, event: string, data: any) {
  if (ioInstance) {
    ioInstance.to(`stream:${streamId}`).emit(event, data);
  }
}
