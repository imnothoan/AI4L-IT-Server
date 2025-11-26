import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

interface Client {
    ws: WebSocket;
    userId: string;
    role: 'student' | 'instructor' | 'proctor';
    examId?: string;
    attemptId?: string;
}

class ProctorWebSocketService {
    private wss: WebSocketServer | null = null;
    private clients: Map<string, Client> = new Map();
    private proctorClients: Set<string> = new Set(); // Track proctor connections

    initialize(server: any) {
        this.wss = new WebSocketServer({ server, path: '/ws/proctor' });

        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
            this.handleConnection(ws, req);
        });

        console.log('Proctor WebSocket service initialized on /ws/proctor');
    }

    private handleConnection(ws: WebSocket, req: IncomingMessage) {
        const params = new URL(req.url || '', `http://${req.headers.host}`).searchParams;
        const token = params.get('token');

        if (!token) {
            ws.close(1008, 'No token provided');
            return;
        }

        try {
            const decoded = jwt.verify(token, config.jwtSecret) as any;
            const clientId = `${decoded.id}-${Date.now()}`;

            const client: Client = {
                ws,
                userId: decoded.id,
                role: decoded.role
            };

            this.clients.set(clientId, client);

            if (client.role === 'instructor' || client.role === 'proctor') {
                this.proctorClients.add(clientId);
                console.log(`✅ Proctor connected: ${client.userId} (${this.proctorClients.size} active)`);

                // Send current active sessions
                this.sendInitialSessions(clientId);
            }

            ws.on('message', (data) => {
                this.handleMessage(clientId, data.toString());
            });

            ws.on('close', () => {
                this.clients.delete(clientId);
                this.proctorClients.delete(clientId);
                console.log(`❌ Client disconnected: ${clientId}`);
            });

            ws.on('error', (error) => {
                console.error(`WebSocket error for ${clientId}:`, error);
            });

        } catch (error) {
            console.error('Authentication error:', error);
            ws.close(1008, 'Invalid token');
        }
    }

    private handleMessage(clientId: string, message: string) {
        try {
            const data = JSON.parse(message);
            const client = this.clients.get(clientId);

            if (!client) return;

            switch (data.type) {
                case 'session_update':
                    // Student sends session updates
                    if (client.role === 'student') {
                        client.examId = data.examId;
                        client.attemptId = data.attemptId;
                        this.broadcastToProctors({
                            type: 'session_update',
                            session: {
                                id: client.attemptId,
                                studentId: client.userId,
                                studentName: data.studentName,
                                examTitle: data.examTitle,
                                currentTheta: data.currentTheta,
                                standardError: data.standardError,
                                questionsAnswered: data.questionsAnswered,
                                cheatWarnings: data.cheatWarnings || 0,
                                webcamStatus: data.webcamStatus || 'active',
                                screenStatus: data.screenStatus || 'normal',
                                startedAt: data.startedAt,
                                lastActivity: new Date().toISOString()
                            }
                        });
                    }
                    break;

                case 'cheat_warning':
                    // Broadcast cheat warnings to proctors
                    this.broadcastToProctors({
                        type: 'cheat_warning',
                        alert: {
                            studentId: client.userId,
                            studentName: data.studentName,
                            type: data.warningType,
                            timestamp: new Date().toISOString(),
                            severity: data.severity || 'medium'
                        }
                    });
                    break;

                case 'request_sessions':
                    // Proctor requests current sessions
                    if (client.role === 'instructor' || client.role === 'proctor') {
                        this.sendActiveSessions(clientId);
                    }
                    break;
            }
        } catch (error) {
            console.error('Message handling error:', error);
        }
    }

    private sendInitialSessions(clientId: string) {
        const client = this.clients.get(clientId);
        if (!client) return;

        // Collect active student sessions
        const activeSessions = [];
        for (const [id, c] of this.clients.entries()) {
            if (c.role === 'student' && c.attemptId) {
                activeSessions.push({
                    id: c.attemptId,
                    studentId: c.userId,
                    examId: c.examId
                });
            }
        }

        this.send(clientId, {
            type: 'initial_sessions',
            sessions: activeSessions,
            count: activeSessions.length
        });
    }

    private sendActiveSessions(clientId: string) {
        this.sendInitialSessions(clientId);
    }

    private broadcastToProctors(message: any) {
        const payload = JSON.stringify(message);

        for (const clientId of this.proctorClients) {
            const client = this.clients.get(clientId);
            if (client && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(payload);
            }
        }
    }

    private send(clientId: string, message: any) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }

    // Public method to broadcast session updates from other parts of the app
    public broadcastSessionUpdate(sessionData: any) {
        this.broadcastToProctors({
            type: 'session_update',
            session: sessionData
        });
    }

    // Public method to broadcast cheat warnings
    public broadcastCheatWarning(alertData: any) {
        this.broadcastToProctors({
            type: 'cheat_warning',
            alert: alertData
        });
    }

    public getActiveSessionCount(): number {
        let count = 0;
        for (const client of this.clients.values()) {
            if (client.role === 'student' && client.attemptId) {
                count++;
            }
        }
        return count;
    }

    public getProctorCount(): number {
        return this.proctorClients.size;
    }
}

export const proctorWebSocketService = new ProctorWebSocketService();
