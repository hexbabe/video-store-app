import React, { useState, useEffect } from 'react';
import { createRobotClient, GenericComponentClient, Struct } from '@viamrobotics/sdk';
import Cookies from "js-cookie";

// Create a Viam client
async function createClient() {
    try {
      // Get credentials from localStorage
      let apiKeyId = "";
      let apiKeySecret = "";
      let host = "";
      let machineId = "";

      // Extract the machine identifier from the URL
      const machineCookieKey = window.location.pathname.split("/")[2];
      ({
        apiKey: { id: apiKeyId, key: apiKeySecret },
        machineId: machineId,
        hostname: host,
      } = JSON.parse(Cookies.get(machineCookieKey)));

      if (!apiKeySecret || !apiKeyId) {
        throw new Error('API credentials not found');
      }

      const client = await createRobotClient({
        host,
        signalingAddress: 'https://app.viam.com:443',
        credentials: {
          type: 'api-key',
          payload: apiKeySecret,
          authEntity: apiKeyId
        }
      });

      return client;
    } catch (error) {
      console.error('Error creating client:', error);
      throw error;
    }
};

function VideoStore({ machineId }) {
  const [resources, setResources] = useState([]);
  const [selectedVideoStore, setSelectedVideoStore] = useState(null);
  const [selectedResourceName, setSelectedResourceName] = useState("");
  const [fromTime, setFromTime] = useState(() => {
    const d = new Date(Date.now() - 1 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  });
  const [toTime, setToTime] = useState(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  });
  const pad2 = (n) => String(n).padStart(2, '0');
  const toUTCGoFormat = (localDateTimeStr) => {
    if (!localDateTimeStr) return '';
    const d = new Date(localDateTimeStr);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getUTCFullYear();
    const mm = pad2(d.getUTCMonth() + 1);
    const dd = pad2(d.getUTCDate());
    const HH = pad2(d.getUTCHours());
    const MM = pad2(d.getUTCMinutes());
    const SS = pad2(d.getUTCSeconds());
    return `${yyyy}-${mm}-${dd}_${HH}-${MM}-${SS}Z`;
  };
  const fromUTC = toUTCGoFormat(fromTime);
  const toUTC = toUTCGoFormat(toTime);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viamClient, setViamClient] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [gettingState, setGettingState] = useState(false);
  const [storageState, setStorageState] = useState(null);

  useEffect(() => {
    async function fetchAndSetResources() {
        const viamClient = await createClient();
        setViamClient(viamClient);

        const resourceNames = await viamClient.resourceNames();
        const tmpResources = resourceNames.map(resource => ({
            id: resource.name,
            name: resource.name
        }));
        setResources(tmpResources);
        setLoading(false);

        return 0;
    };

    if (resources.length === 0) {
        fetchAndSetResources();
    }

    if (!machineId) {
      setResources([]);
      setLoading(false);
      return;
    }

}, [machineId, resources.length]);
    const handleVideoStoreSelect = async (resourceName) => {
        if (!viamClient || !resourceName) return;
        const genericComponentClient = new GenericComponentClient(viamClient, resourceName);
        setSelectedVideoStore(genericComponentClient);
        setSelectedResourceName(resourceName);
    };

    const handleFetchVideo = async () => {
        try {
            if (!selectedVideoStore) {
                setError('select a video-store resource first');
                return;
            }
            if (!fromUTC || !toUTC) {
                setError('select a valid time range');
                return;
            }
            setError(null);
            setFetching(true);
            const resp = await selectedVideoStore.doCommand(
              Struct.fromJson({
                  command: 'fetch',
                  from: fromUTC,
                  to: toUTC,
              })
          );
            const payload = resp?.toJson ? resp.toJson() : resp;
            const videoBase64 = payload?.video;
            if (!videoBase64 || typeof videoBase64 !== 'string') {
              throw new Error('no video data in response');
            }

            const binary = atob(videoBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const baseName = selectedResourceName || 'video';
            a.download = `${baseName}_${fromUTC}_${toUTC}.mp4`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('error fetching video:', e);
            setError(e?.message || 'failed to fetch video');
        } finally {
            setFetching(false);
        }
    };

    const handleGetStorageState = async () => {
        try {
            if (!selectedVideoStore) {
                setError('select a video-store resource first');
                return;
            }
            setError(null);
            setGettingState(true);
            const resp = await selectedVideoStore.doCommand(
              Struct.fromJson({
                command: 'get-storage-state'
              })
            );
            const payload = resp?.toJson ? resp.toJson() : resp;
            setStorageState(payload);
        } catch (e) {
            console.error('error getting storage state:', e);
            setError(e?.message || 'failed to get storage state');
        } finally {
            setGettingState(false);
        }
    };

  if (!machineId) return null;
  if (loading) return <div>Loading machine resources...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h3>Video Store</h3>
      <div>
        <select onChange={(e) => handleVideoStoreSelect(e.target.value)}>
          <option value="">Select the video-store resource</option>
          {resources.map(camera => (
            <option key={camera.id} value={camera.name}>{camera.name}</option>
          ))}
        </select>
      </div>
      {selectedVideoStore && (
        <div>
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '8px' }}>Get storage state</div>
            <div>
              <button onClick={handleGetStorageState} disabled={gettingState}>
                {gettingState ? 'Getting…' : 'Get storage state'}
              </button>
            </div>
            {storageState && (
              <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(storageState, null, 2)}</pre>
            )}
          </div>
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '8px' }}>Fetch video</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label>
                From:
                <input
                  type="datetime-local"
                  step="1"
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                  style={{ marginLeft: '6px' }}
                />
              </label>
              <label>
                To:
                <input
                  type="datetime-local"
                  step="1"
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                  style={{ marginLeft: '6px' }}
                />
              </label>
            </div>
            <div style={{ marginTop: '8px' }}>
              <button onClick={handleFetchVideo} disabled={fetching}>
                {fetching ? 'Fetching…' : 'Fetch video'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoStore;