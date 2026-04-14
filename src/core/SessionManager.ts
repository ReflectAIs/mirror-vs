import * as fs from 'fs';
import * as path from 'path';
import { Message } from '../providers/types';

export interface Session {
    id: string;
    title: string;
    timestamp: number;
    messages: Message[];
}

export class SessionManager {
    private sessionsDir: string;
    private sessionsFile: string;

    constructor(workspaceRoot: string) {
        this.sessionsDir = path.join(workspaceRoot, '.mirror');
        this.sessionsFile = path.join(this.sessionsDir, 'sessions.json');
        this.ensureDirectory();
    }

    private ensureDirectory() {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
        if (!fs.existsSync(this.sessionsFile)) {
            fs.writeFileSync(this.sessionsFile, JSON.stringify([], null, 2));
        }
    }

    getSessions(): Session[] {
        try {
            const data = fs.readFileSync(this.sessionsFile, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            return [];
        }
    }

    saveSession(session: Session) {
        let sessions = this.getSessions();
        const index = sessions.findIndex(s => s.id === session.id);
        
        if (index >= 0) {
            sessions[index] = session;
        } else {
            sessions.unshift(session);
        }

        fs.writeFileSync(this.sessionsFile, JSON.stringify(sessions, null, 2));
    }

    deleteSession(id: string) {
        let sessions = this.getSessions();
        sessions = sessions.filter(s => s.id !== id);
        fs.writeFileSync(this.sessionsFile, JSON.stringify(sessions, null, 2));
    }
}
