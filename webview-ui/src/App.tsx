import React, { useState, useEffect, useRef } from 'react'
import { VscSend, VscHistory, VscSettingsGear, VscTrash, VscArrowLeft, VscLoading, VscTerminal, VscSearch, VscFile, VscFolder, VscStopCircle, VscCheck, VscClose, VscSymbolMethod, VscWarning } from 'react-icons/vsc'
import './App.css'
import Settings from './Settings'
import Buddy from './components/Buddy'
import type { BuddyStatus } from './components/Buddy'
import defaultLogo from './assets/logo.png'

import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

declare global {
  interface Window {
    vscode: any;
  }
}

interface ToolTrace {
  label: string;
  category: 'analyzing' | 'planning' | 'executing';
  path?: string;
  result?: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  type?: 'chunk' | 'step' | 'trace' | 'diff' | 'status' | 'terminal';
  stepData?: any;
  traceData?: ToolTrace;
  diffData?: any;
  terminalData?: { command: string, dir: string, sessionId: string };
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
}

declare const vscode: any;

function App() {
  const [input, setInput] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
   const [currentSessionId, setCurrentSessionId] = useState<string>(Date.now().toString());
   const [generatingSessions, setGeneratingSessions] = useState<Record<string, boolean>>({});
   const isGenerating = generatingSessions[currentSessionId] || false;
  const [view, setView] = useState<'chat' | 'history' | 'settings'>('chat');
  const [logoUri, setLogoUri] = useState<string>(defaultLogo);
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [buddyStatus, setBuddyStatus] = useState<BuddyStatus>('idle');
  
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || {
    id: currentSessionId, title: 'New Chat', messages: []
  };

  useEffect(() => {
    window.vscode.postMessage({ type: 'ready' });
    window.vscode.postMessage({ type: 'getHistory' });
    window.vscode.postMessage({ type: 'getSettings' });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'onInitialize':
          if (message.value.logoUri) setLogoUri(message.value.logoUri);
          break;
        case 'onHistory':
          if (message.value) setSessions(message.value);
          break;
        case 'onSettings':
          if (message.value) setAutonomousMode(message.value.autonomousMode);
          break;
         case 'onActiveGenerations':
           if (message.value) {
             const activeMap: Record<string, boolean> = {};
             message.value.forEach((id: string) => activeMap[id] = true);
             setGeneratingSessions(activeMap);
           }
           break;
         case 'onAssistantChunk':
           updateSession(message.sessionId || currentSessionId, (msg) => {
             const last = msg[msg.length - 1];
             if (last && last.sender === 'assistant' && last.type === 'chunk') {
                 const newMsg = [...msg];
                 newMsg[newMsg.length - 1] = { ...last, text: last.text + message.value };
                 return newMsg;
             } else {
                 return [...msg, { id: Date.now().toString(), text: message.value, sender: 'assistant', type: 'chunk' }];
             }
           }, false);
           break;
         case 'onAssistantMessage':
           updateSession(message.sessionId || currentSessionId, (msg) => [
             ...msg.filter(m => m.type !== 'status' && m.type !== 'chunk'), 
             { id: Date.now().toString(), text: message.value, sender: 'assistant' }
           ], false);
           if (message.sessionId) {
             setGeneratingSessions(prev => ({ ...prev, [message.sessionId]: false }));
           }
           setBuddyStatus('idle');
           break;
         case 'onToolTrace':
           setBuddyStatus('working');
           updateSession(message.sessionId || currentSessionId, (msg) => {
             const last = msg[msg.length - 1];
             if (last && last.type === 'trace' && last.traceData?.label === message.value.label) {
                 const newMsg = [...msg];
                 newMsg[newMsg.length - 1] = { ...last, traceData: message.value };
                 return newMsg;
             }
             return [
               ...msg,
               { id: Date.now().toString(), text: '', sender: 'assistant', type: 'trace', traceData: message.value }
             ];
           }, false);
           break;
         case 'onAssistantComplete':
           break;
         case 'requestDiffReview':
           updateSession(message.sessionId || currentSessionId, (msg) => [
             ...msg, 
             { id: Date.now().toString(), text: `Proposed changes for ${message.value.filepath}`, sender: 'assistant', type: 'diff', diffData: message.value }
           ], false);
           if (message.sessionId) {
             setGeneratingSessions(prev => ({ ...prev, [message.sessionId]: false }));
           }
           break;
         case 'onPatchApplied':
             updateSession(message.sessionId || currentSessionId, (msg) => [
                 ...msg,
                 { id: Date.now().toString(), text: `Patch applied. Diagnosing...`, sender: 'assistant' }
             ], false);
             break;
          case 'requestTerminalReview':
            updateSession(message.sessionId || currentSessionId, (msg) => [
              ...msg, 
              { 
                id: Date.now().toString(), 
                text: `Execution Request: ${message.value.command}`, 
                sender: 'assistant', 
                type: 'terminal', 
                terminalData: message.value 
              }
            ], false);
            if (message.sessionId) {
              setGeneratingSessions(prev => ({ ...prev, [message.sessionId]: false }));
            }
            break;
       }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [currentSessionId]);

  const handleScroll = () => {
    // No-op for now, used to update isAtBottom state
  };

  useEffect(() => {
    const scroller = chatContainerRef.current;
    if (scroller) {
      const isAtBot = scroller.scrollHeight - scroller.scrollTop <= scroller.clientHeight + 40; // 40px threshold
      if (isAtBot) {
        requestAnimationFrame(() => {
          scroller.scrollTo({
            top: scroller.scrollHeight,
            behavior: isGenerating ? 'auto' : 'smooth'
          });
        });
      }
    }
  }, [currentSession.messages, isGenerating]);

  const updateSession = (sid: string, updateFn: (msgs: Message[]) => Message[], shouldSave: boolean = true) => {
    setSessions(prev => {
        const newSessions = [...prev];
        const session = newSessions.find(s => s.id === sid);
        const newMessages = updateFn(session ? session.messages : []);
        const title = (session && session.title !== 'New Chat') ? session.title : (newMessages[0]?.text?.substring(0, 30) || 'New Chat');

        if (session) {
            session.messages = newMessages;
            session.title = title;
        } else {
            newSessions.unshift({ id: sid, title, messages: newMessages });
        }
        if (shouldSave) {
            window.vscode.postMessage({ type: 'saveChat', value: newSessions.find(s => s.id === sid) });
        }
        return newSessions;
    });
  };
  const updateCurrentSession = (fn: (msgs: Message[]) => Message[], bubbleToTop = true) => {
      updateSession(currentSessionId, fn, bubbleToTop);
  };

  const handleSend = () => {
    if (!input.trim() || isGenerating) return;
    const userMsg: Message = { id: Date.now().toString(), text: input, sender: 'user' };
    updateCurrentSession((msg) => [...msg, userMsg], true);
    setGeneratingSessions(prev => ({ ...prev, [currentSessionId]: true }));
    
    // Explicitly snap to bottom after user message
    const scroller = chatContainerRef.current;
    if (scroller) {
      setTimeout(() => {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'auto' });
      }, 0);
    }
    
    window.vscode.postMessage({ type: 'onUserMessage', value: input, sessionId: currentSessionId });
    setInput('');
  };

  const handleFileClick = (path: string) => {
    window.vscode.postMessage({ type: 'openFile', value: path });
  };

  const isFilePath = (text: string) => {
    const t = text.trim();
    if (!t || t.length > 255) return false;
    
    const fileRegex = /^(\.?[\w\-\.\/]+)\.([a-z0-9]+)$|^(Dockerfile|LICENSE|README|Makefile|COMMIT_EDITMSG)$|^\.[\w\-]+$/i;
    // Basic heuristics: must contain a dot (for extension/hidden) OR be a known suffix-less file
    return fileRegex.test(t);
  };

  const handleStop = () => {
    window.vscode.postMessage({ type: 'stopGeneration', sessionId: currentSessionId });
    setGeneratingSessions(prev => ({ ...prev, [currentSessionId]: false }));
  };

  const switchSession = (id: string) => {
    setCurrentSessionId(id);
    setView('chat');
  };

  const startNewChat = () => {
    const newId = Date.now().toString();
    setCurrentSessionId(newId);
    setView('chat');
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    window.vscode.postMessage({ type: 'deleteChat', value: id });
    if (currentSessionId === id && newSessions.length > 0) {
      setCurrentSessionId(newSessions[0].id);
    } else if (newSessions.length === 0) {
      startNewChat();
    }
  };

  const commitPatch = (diff: any) => {
    window.vscode.postMessage({ type: 'commitPatch', value: diff });
    updateCurrentSession((msg) => msg.filter(m => m.id !== diff.messageId), false);
  };

  const renderTerminalReview = (msg: Message) => {
    const { terminalData } = msg;
    if (!terminalData) return null;

    return (
      <div className="terminal-review-card">
        <div className="terminal-header">
          <VscTerminal />
          <span>Security Mailbox: Command Approval</span>
        </div>
        <div className="terminal-body">
          <pre className="terminal-command">{terminalData.command}</pre>
          <div className="terminal-dir">Directory: <code>{terminalData.dir}</code></div>
        </div>
        <div className="terminal-actions">
          <button className="approve-button" onClick={() => window.vscode.postMessage({ type: 'approveTerminal', value: terminalData })}>
            <VscCheck /> Run Command
          </button>
          <button className="reject-button" onClick={() => window.vscode.postMessage({ type: 'rejectTerminal', value: terminalData })}>
            <VscClose /> Reject
          </button>
        </div>
      </div>
    );
  };

  const getToolIcon = (label: string) => {
    if (label.includes('Listing')) return <VscFolder />;
    if (label.includes('Reading') || label.includes('Skeleton')) return <VscFile />;
    if (label.includes('Searching') || label.includes('Grep')) return <VscSearch />;
    if (label.includes('Terminal')) return <VscTerminal />;
    if (label.includes('Symbols')) return <VscSymbolMethod />;
    if (label.includes('Diagnostics')) return <VscWarning />;
    if (label.includes('Dreaming')) return <VscLoading className="spinning" />;
    return <VscSettingsGear />;
  };

  const renderDiffLines = (original: string, modified: string) => {
    const oldLines = original.split('\n');
    const newLines = modified.split('\n');
    const result: any[] = [];
    
    // Simple diff logic for UI visualization
    let i = 0, j = 0;
    while (i < oldLines.length || j < newLines.length) {
      if (oldLines[i] === newLines[j]) {
        result.push({ type: 'context', text: oldLines[i] });
        i++; j++;
      } else if (i < oldLines.length && !newLines.includes(oldLines[i])) {
        result.push({ type: 'removed', text: oldLines[i] });
        i++;
      } else if (j < newLines.length && !oldLines.includes(newLines[j])) {
        result.push({ type: 'added', text: newLines[j] });
        j++;
      } else {
        // Fallback for complex changes
        if (i < oldLines.length) { result.push({ type: 'removed', text: oldLines[i] }); i++; }
        if (j < newLines.length) { result.push({ type: 'added', text: newLines[j] }); j++; }
      }
      if (result.length > 100) break; // Cap UI diff for performance
    }
    return result;
  };

  return (
    <div className="app-container">
      <header className="minimal-header">
        <div className="header-left">
          <div className="logo-group">
            <img src={logoUri} className="logo-img" alt="logo" />
            {autonomousMode && <div className="auto-pulse-dot"></div>}
          </div>
          <div className="brand-name">MIRROR</div>
        </div>
        
        <div className="header-center">
          <Buddy status={buddyStatus} isAutonomous={autonomousMode} />
        </div>

        <div className="header-right">
          <button className="nav-btn" onClick={() => setView('history')}><VscHistory /></button>
          <button className="nav-btn" onClick={() => setView('settings')}><VscSettingsGear /></button>
        </div>
      </header>

      {view === 'chat' && (
        <main className="chat-interface">
          <div className="scroller" ref={chatContainerRef} onScroll={handleScroll}>
            {currentSession.messages.map((msg, i) => {
                const isStacked = i > 0 && currentSession.messages[i-1].sender === msg.sender && (currentSession.messages[i-1].type || 'text') === (msg.type || 'text') && msg.type !== 'trace';
                
                return (
                  <div key={msg.id} className={`message sender-${msg.sender} ${isStacked ? 'stacked' : ''} type-${msg.type || 'text'}`}>
                    {!isStacked && <div className="label">{msg.sender === 'user' ? 'YOU' : 'MIRROR'}</div>}
                    <div className="bubble">
                      {msg.type === 'terminal' ? (
                        renderTerminalReview(msg)
                      ) : msg.type === 'diff' ? (
                        <div className="diff-card">
                          <div className="diff-header">
                            <VscSymbolMethod />
                            <span className="diff-title">{msg.diffData.filepath}</span>
                          </div>
                          <div className="diff-content">
                            {renderDiffLines(msg.diffData.original || '', msg.diffData.content || '').map((line: any, idx: number) => (
                              <div key={idx} className={`diff-line ${line.type}`}>
                                <span className="diff-indicator">{line.type === 'added' ? '+' : (line.type === 'removed' ? '-' : ' ')}</span>
                                <span className="diff-text">{line.text}</span>
                              </div>
                            ))}
                          </div>
                          <div className="diff-actions">
                            <button className="apply-btn" onClick={() => commitPatch(msg.diffData)}>
                              <VscCheck /> Apply Changes
                            </button>
                            <button className="discard-btn" onClick={() => updateCurrentSession(msgs => msgs.filter(m => m.id !== msg.id), false)}>
                              <VscClose /> Discard
                            </button>
                          </div>
                        </div>
                      ) : msg.type === 'trace' ? (
                        <div 
                          className={`tool-trace-card ${msg.traceData?.path ? 'clickable' : ''}`}
                          onClick={() => msg.traceData?.path && handleFileClick(msg.traceData.path)}
                        >
                          <div className={`trace-header category-${msg.traceData?.category}`}>
                            {getToolIcon(msg.traceData?.label || '')}
                            <span className="trace-label">{msg.traceData?.label}</span>
                          </div>
                          {msg.traceData?.result && (
                            <div className="trace-result">{msg.traceData.result}</div>
                          )}
                        </div>
                      ) : (
                        <div className="text markdown-body">
                          <ReactMarkdown
                            components={{
                              code({node, inline, className, children, ...props}: any) {
                                const match = /language-(\w+)/.exec(className || '');
                                const content = String(children).trim();
                                if (inline && isFilePath(content)) {
                                    return (
                                        <span className="file-link" onClick={() => handleFileClick(content)}>
                                            {children}
                                        </span>
                                    );
                                }
                                return !inline && match ? (
                                  <SyntaxHighlighter
                                    {...props}
                                    children={String(children).replace(/\n$/, '')}
                                    style={vscDarkPlus}
                                    language={match[1]}
                                    PreTag="div"
                                  />
                                ) : (
                                  <code {...props} className={className}>
                                    {children}
                                  </code>
                                )
                              }
                            }}
                          >
                            {msg.text}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
            })}
            {isGenerating && <div className="message sender-assistant"><div className="bubble thinking"><VscLoading className="spinning" /> Thinking...</div></div>}
          </div>

          <footer className="composer">
            <div className="input-group">
              <textarea 
                value={input} 
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Talk to Mirror..."
                rows={1}
              />
              <button className={`send-btn ${isGenerating ? 'stop' : ''}`} onClick={isGenerating ? handleStop : handleSend}>
                {isGenerating ? <VscStopCircle /> : <VscSend />}
              </button>
            </div>
          </footer>
        </main>
      )}

      {view === 'history' && (
        <div className="history-view">
          <div className="history-header">
            <button className="back-button" onClick={() => setView('chat')}><VscArrowLeft /></button>
            <h3>Recent Activity</h3>
            <button className="new-chat-btn" onClick={startNewChat}>+ New</button>
          </div>
          <div className="history-list">
            {sessions.map(s => (
              <div key={s.id} className={`history-item ${s.id === currentSessionId ? 'active' : ''}`} onClick={() => switchSession(s.id)}>
                <div className="history-info">
                  <div className="history-title">{s.title || 'Empty chat'}</div>
                </div>
                <button className="delete-btn" onClick={(e) => deleteSession(s.id, e)}><VscTrash /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'settings' && <Settings onBack={() => setView('chat')} />}
    </div>
  )
}

export default App