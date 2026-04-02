import React from 'react';
import { VscClose, VscFileCode, VscTerminal, VscEye, VscJson, VscBrowser } from 'react-icons/vsc';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Artifact {
  id: string;
  type: 'code' | 'svg' | 'markdown' | 'terminal' | 'html';
  title: string;
  content: string;
  language?: string;
}

interface ArtifactViewProps {
  artifact: Artifact | null;
  onClose: () => void;
}

const ArtifactView: React.FC<ArtifactViewProps> = ({ artifact, onClose }) => {
  if (!artifact) return null;

  const renderContent = () => {
    switch (artifact.type) {
      case 'svg':
        return (
          <div className="artifact-canvas" dangerouslySetInnerHTML={{ __html: artifact.content }} />
        );
      case 'html':
        return (
          <iframe 
            title="Artifact Preview"
            srcDoc={artifact.content} 
            className="artifact-iframe"
          />
        );
      case 'code':
      case 'markdown':
        return (
          <SyntaxHighlighter
            language={artifact.language || (artifact.type === 'markdown' ? 'markdown' : 'typescript')}
            style={vscDarkPlus}
            customStyle={{ margin: 0, padding: '20px', background: 'transparent' }}
          >
            {artifact.content}
          </SyntaxHighlighter>
        );
      case 'terminal':
        return (
          <pre className="artifact-terminal">{artifact.content}</pre>
        );
      default:
        return <div>Unsupported artifact type</div>;
    }
  };

  const getIcon = () => {
    switch (artifact.type) {
      case 'code': return <VscFileCode />;
      case 'svg': return <VscEye />;
      case 'terminal': return <VscTerminal />;
      case 'html': return <VscBrowser />;
      default: return <VscJson />;
    }
  };

  return (
    <div className="artifact-view-container">
      <header className="artifact-header">
        <div className="artifact-info">
          {getIcon()}
          <span className="artifact-title">{artifact.title}</span>
        </div>
        <button className="close-btn" onClick={onClose}>
          <VscClose />
        </button>
      </header>
      <main className="artifact-body">
        {renderContent()}
      </main>
    </div>
  );
};

export default ArtifactView;
