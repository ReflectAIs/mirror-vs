import React from 'react';
import { VscTerminal, VscSearch, VscSettingsGear, VscCheck, VscWarning } from 'react-icons/vsc';

export type BuddyStatus = 'idle' | 'thinking' | 'working' | 'success' | 'error';

interface BuddyProps {
  status: BuddyStatus;
  isAutonomous?: boolean;
}

const Buddy: React.FC<BuddyProps> = ({ status, isAutonomous }) => {
  const getExpression = () => {
    switch (status) {
      case 'thinking':
        return (
          <div className="buddy-eyes thinking">
            <div className="eye left"><span></span></div>
            <div className="eye right"><span></span></div>
          </div>
        );
      case 'working':
        return (
          <div className="buddy-eyes working">
            <div className="eye left">{">"}</div>
            <div className="eye right">{"<"}</div>
          </div>
        );
      case 'error':
        return (
          <div className="buddy-eyes error">
            <div className="eye left">×</div>
            <div className="eye right">×</div>
          </div>
        );
      case 'success':
        return (
          <div className="buddy-eyes success">
            <div className="eye left">^</div>
            <div className="eye right">^</div>
          </div>
        );
      default:
        return (
          <div className="buddy-eyes idle">
            <div className="eye left"><span></span></div>
            <div className="eye right"><span></span></div>
          </div>
        );
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'thinking': return <VscSearch className="buddy-status-icon spinning" />;
      case 'working': return <VscSettingsGear className="buddy-status-icon spinning" />;
      case 'success': return <VscCheck className="buddy-status-icon" />;
      case 'error': return <VscWarning className="buddy-status-icon" />;
      default: return <VscTerminal className={`buddy-status-icon pulse ${isAutonomous ? 'gold' : ''}`} />;
    }
  };

  return (
    <div className={`buddy-container status-${status} ${isAutonomous ? 'mode-autonomous' : ''}`}>
      {isAutonomous && <div className="buddy-aura"></div>}
      <div className="buddy-body">
        {getExpression()}
      </div>
      <div className="buddy-badge">
        {getIcon()}
      </div>
      {isAutonomous && <div className="kairos-label">KAIROS</div>}
    </div>
  );
};

export default Buddy;
