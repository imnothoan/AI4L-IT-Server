/**
 * WebSocket Service
 * Handles real-time communication for:
 * - Live exam monitoring
 * - Real-time anti-cheat warnings
 * - Student progress updates
 * - Instant notifications
 */

import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import type { Server } from 'http';

export interface WebSocketMessage {
  type: 'auth' | 'exam_started' | 'exam_progress' | 'exam_completed' | 
        'cheat_warning' | 'student_joined' | 'student_left' | 
        'answer_submitted' | 'ping' | 'pong' | 'error';
  data?: any;
  timestamp?: number;
}

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  userRole?: string;
  examId?: string;
  isAuthenticated?: boolean;
}

interface ExamSession {
  examId: string;
  students: Set<string>; // student user IDs
  instructors: Set<string>; // instructor user IDs
  connections: Map<string, AuthenticatedWebSocket>; // userId -> websocket
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private examSessions: Map<string, ExamSession> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  /**
   * Initialize WebSocket server
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      verifyClient: (_info, callback) => {
        // Basic verification - full auth happens after connection
        callback(true);
      }
    });

    console.log('🔌 WebSocket server initialized on /ws');

    this.wss.on('connection', (ws: AuthenticatedWebSocket, request) => {
      console.log('📡 New WebSocket connection');
      
      // Extract exam ID from URL if present
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const pathParts = url.pathname.split('/');
      const examId = pathParts[pathParts.length - 1];
      
      if (examId && examId !== 'ws') {
        ws.examId = examId;
      }

      // Set up message handler
      ws.on('message', (data) => {
        this.handleMessage(ws, data.toString());
      });

      // Handle close
      ws.on('close', () => {
        this.handleDisconnection(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Send welcome message
      this.sendMessage(ws, {
        type: 'auth',
        data: { message: 'Please authenticate' },
        timestamp: Date.now()
      });
    });

    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: AuthenticatedWebSocket, data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data);

      switch (message.type) {
        case 'auth':
          this.handleAuthentication(ws, message.data);
          break;
        
        case 'ping':
          this.sendMessage(ws, { type: 'pong', timestamp: Date.now() });
          break;

        case 'exam_started':
          if (ws.isAuthenticated) {
            this.handleExamStarted(ws, message.data);
          }
          break;

        case 'exam_progress':
          if (ws.isAuthenticated) {
            this.handleExamProgress(ws, message.data);
          }
          break;

        case 'exam_completed':
          if (ws.isAuthenticated) {
            this.handleExamCompleted(ws, message.data);
          }
          break;

        case 'cheat_warning':
          if (ws.isAuthenticated) {
            this.handleCheatWarning(ws, message.data);
          }
          break;

        case 'answer_submitted':
          if (ws.isAuthenticated) {
            this.handleAnswerSubmitted(ws, message.data);
          }
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.sendMessage(ws, {
        type: 'error',
        data: { message: 'Invalid message format' },
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle WebSocket authentication
   */
  private handleAuthentication(ws: AuthenticatedWebSocket, data: any): void {
    try {
      const { token } = data;

      if (!token) {
        this.sendMessage(ws, {
          type: 'error',
          data: { message: 'Token required' },
          timestamp: Date.now()
        });
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, config.JWT_SECRET) as any;
      
      ws.userId = decoded.userId;
      ws.userRole = decoded.role;
      ws.isAuthenticated = true;

      console.log(`✅ WebSocket authenticated: User ${ws.userId} (${ws.userRole})`);

      // If exam ID is present, join the exam session
      if (ws.examId) {
        this.joinExamSession(ws.examId, ws);
      }

      // Send success message
      this.sendMessage(ws, {
        type: 'auth',
        data: { 
          success: true, 
          userId: ws.userId,
          role: ws.userRole,
          examId: ws.examId
        },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Authentication error:', error);
      this.sendMessage(ws, {
        type: 'error',
        data: { message: 'Authentication failed' },
        timestamp: Date.now()
      });
      ws.close();
    }
  }

  /**
   * Join an exam session
   */
  private joinExamSession(examId: string, ws: AuthenticatedWebSocket): void {
    if (!ws.userId || !ws.userRole) return;

    let session = this.examSessions.get(examId);
    
    if (!session) {
      session = {
        examId,
        students: new Set(),
        instructors: new Set(),
        connections: new Map()
      };
      this.examSessions.set(examId, session);
    }

    // Add to appropriate set
    if (ws.userRole === 'student') {
      session.students.add(ws.userId);
    } else if (ws.userRole === 'instructor') {
      session.instructors.add(ws.userId);
    }

    session.connections.set(ws.userId, ws);

    // Notify instructors of student joining
    if (ws.userRole === 'student') {
      this.broadcastToInstructors(examId, {
        type: 'student_joined',
        data: {
          examId,
          studentId: ws.userId,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      });
    }

    console.log(`👤 User ${ws.userId} joined exam session ${examId}`);
  }

  /**
   * Handle exam started event
   */
  private handleExamStarted(ws: AuthenticatedWebSocket, data: any): void {
    if (!ws.examId || !ws.userId) return;

    // Broadcast to instructors
    this.broadcastToInstructors(ws.examId, {
      type: 'exam_started',
      data: {
        examId: ws.examId,
        studentId: ws.userId,
        attemptId: data.attemptId,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });
  }

  /**
   * Handle exam progress update
   */
  private handleExamProgress(ws: AuthenticatedWebSocket, data: any): void {
    if (!ws.examId || !ws.userId) return;

    // Broadcast to instructors
    this.broadcastToInstructors(ws.examId, {
      type: 'exam_progress',
      data: {
        examId: ws.examId,
        studentId: ws.userId,
        attemptId: data.attemptId,
        progress: data.progress,
        currentQuestion: data.currentQuestion,
        timeRemaining: data.timeRemaining,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });
  }

  /**
   * Handle exam completed event
   */
  private handleExamCompleted(ws: AuthenticatedWebSocket, data: any): void {
    if (!ws.examId || !ws.userId) return;

    // Broadcast to instructors
    this.broadcastToInstructors(ws.examId, {
      type: 'exam_completed',
      data: {
        examId: ws.examId,
        studentId: ws.userId,
        attemptId: data.attemptId,
        score: data.score,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });

    // Remove from session
    this.leaveExamSession(ws);
  }

  /**
   * Handle cheat warning
   */
  private handleCheatWarning(ws: AuthenticatedWebSocket, data: any): void {
    if (!ws.examId || !ws.userId) return;

    console.log(`⚠️ Cheat warning for user ${ws.userId} in exam ${ws.examId}`);

    // Broadcast to instructors immediately
    this.broadcastToInstructors(ws.examId, {
      type: 'cheat_warning',
      data: {
        examId: ws.examId,
        studentId: ws.userId,
        attemptId: data.attemptId,
        warning: data.warning,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });
  }

  /**
   * Handle answer submitted
   */
  private handleAnswerSubmitted(ws: AuthenticatedWebSocket, data: any): void {
    if (!ws.examId || !ws.userId) return;

    // Optionally broadcast to instructors for live monitoring
    this.broadcastToInstructors(ws.examId, {
      type: 'answer_submitted',
      data: {
        examId: ws.examId,
        studentId: ws.userId,
        attemptId: data.attemptId,
        questionId: data.questionId,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(ws: AuthenticatedWebSocket): void {
    console.log('🔌 WebSocket disconnected');
    
    if (ws.examId && ws.userId) {
      // Notify instructors
      this.broadcastToInstructors(ws.examId, {
        type: 'student_left',
        data: {
          examId: ws.examId,
          studentId: ws.userId,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      });

      // Remove from session
      this.leaveExamSession(ws);
    }
  }

  /**
   * Leave exam session
   */
  private leaveExamSession(ws: AuthenticatedWebSocket): void {
    if (!ws.examId || !ws.userId) return;

    const session = this.examSessions.get(ws.examId);
    if (!session) return;

    session.students.delete(ws.userId);
    session.instructors.delete(ws.userId);
    session.connections.delete(ws.userId);

    // Clean up empty sessions
    if (session.connections.size === 0) {
      this.examSessions.delete(ws.examId);
      console.log(`🧹 Cleaned up empty session for exam ${ws.examId}`);
    }
  }

  /**
   * Broadcast message to all instructors in an exam session
   */
  private broadcastToInstructors(examId: string, message: WebSocketMessage): void {
    const session = this.examSessions.get(examId);
    if (!session) return;

    session.instructors.forEach(instructorId => {
      const ws = session.connections.get(instructorId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, message);
      }
    });
  }



  /**
   * Broadcast message to all participants in an exam session
   */
  broadcastToExam(examId: string, message: WebSocketMessage): void {
    const session = this.examSessions.get(examId);
    if (!session) return;

    session.connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, message);
      }
    });
  }

  /**
   * Send message to specific WebSocket
   */
  private sendMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;

      this.wss.clients.forEach((ws: AuthenticatedWebSocket) => {
        if (ws.readyState === WebSocket.OPEN) {
          this.sendMessage(ws, { type: 'ping', timestamp: Date.now() });
        }
      });
    }, this.HEARTBEAT_INTERVAL);

    console.log('💓 WebSocket heartbeat started');
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get active exam sessions
   */
  getActiveSessions(): Map<string, ExamSession> {
    return this.examSessions;
  }

  /**
   * Get session info for an exam
   */
  getExamSessionInfo(examId: string): { studentCount: number; instructorCount: number } | null {
    const session = this.examSessions.get(examId);
    if (!session) return null;

    return {
      studentCount: session.students.size,
      instructorCount: session.instructors.size
    };
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown(): void {
    this.stopHeartbeat();
    
    if (this.wss) {
      this.wss.clients.forEach(ws => {
        ws.close();
      });
      this.wss.close();
      console.log('🔌 WebSocket server shut down');
    }
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
