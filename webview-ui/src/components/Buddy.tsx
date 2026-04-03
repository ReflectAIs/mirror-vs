import React from 'react';
import { VscSearch, VscSettingsGear, VscCheck, VscWarning } from 'react-icons/vsc';

export type BuddyStatus = 'idle' | 'thinking' | 'working' | 'success' | 'error';

interface BuddyProps {
  status: BuddyStatus;
  isAutonomous?: boolean;
}

const Buddy: React.FC<BuddyProps> = ({ status, isAutonomous }) => {
  const getFace = () => {
    return (
      <div className={`buddy-face ${status}`}>
        <div className="buddy-eyes">
          <div className="eye left"></div>
          <div className="eye right"></div>
        </div>
        <div className="buddy-mouth">
          <div className="mouth-path"></div>
        </div>
      </div>
    );
  };

  return (
    <div className={`buddy-container status-${status} ${isAutonomous ? 'mode-autonomous' : ''}`}>
      <div className="buddy-aura"></div>
      <div className="buddy-wrapper">
        <div className="buddy-body">
          {getFace()}
        </div>
        <div className="buddy-accessory">
          {status === 'thinking' && <VscSearch className="spinning" />}
          {status === 'working' && <VscSettingsGear className="spinning" />}
          {status === 'success' && <VscCheck />}
          {status === 'error' && <VscWarning />}
        </div>
      </div>
      {isAutonomous && <div className="buddy-label">AUTONOMOUS</div>}
    </div>
  );
};

export default Buddy;
