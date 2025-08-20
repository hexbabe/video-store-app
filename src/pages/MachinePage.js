import React from 'react';
import VideoStore from '../components/VideoStore';

function MachinePage() {
  const machineId = window.location.pathname.split("/")[2];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>

      <h1>Machine: {machineId}</h1>
      <VideoStore machineId={machineId} />
    </div>
  );
}

export default MachinePage;