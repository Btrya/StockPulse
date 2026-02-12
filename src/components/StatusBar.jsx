import { useState, useEffect, useRef, useCallback } from 'react';
import { Tag, Button, Tooltip } from 'antd';
import { SyncOutlined, CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { fetchStatus, triggerScan } from '../lib/api';

export default function StatusBar() {
  const [status, setStatus] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState(null);
  const timerRef = useRef(null);

  const refreshStatus = useCallback(() => {
    fetchStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 30000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  // 轮询续扫
  const continueScan = useCallback(async () => {
    try {
      const res = await triggerScan({});
      setScanInfo(res);

      if (res.needContinue) {
        // 还没扫完，500ms 后继续
        timerRef.current = setTimeout(continueScan, 500);
      } else {
        // 扫完了
        setScanning(false);
        setScanInfo(null);
        refreshStatus();
      }
    } catch (err) {
      console.error('scan failed:', err);
      setScanning(false);
      setScanInfo(null);
    }
  }, [refreshStatus]);

  const handleScan = () => {
    setScanning(true);
    setScanInfo(null);
    continueScan();
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 扫描中：显示进度
  if (scanning || status?.scanning) {
    const idx = scanInfo?.idx || status?.progress?.idx || 0;
    const total = scanInfo?.total || status?.progress?.total || 0;
    const klt = scanInfo?.klt || status?.progress?.klt || '';
    const pct = total ? Math.round((idx / total) * 100) : 0;
    return (
      <Tag icon={<SyncOutlined spin />} color="processing">
        扫描中 {klt === 'weekly' ? '周线' : '日线'} {idx}/{total} ({pct}%)
      </Tag>
    );
  }

  const time = status?.lastTime
    ? new Date(status.lastTime).toLocaleString('zh-CN', { hour12: false })
    : null;

  return (
    <div className="flex items-center gap-2">
      {time ? (
        <Tag icon={<CheckCircleOutlined />} color="default">更新: {time}</Tag>
      ) : (
        <Tag color="warning">暂无数据</Tag>
      )}
      <Tooltip title="手动触发全量扫描（断点续扫，可多次触发）">
        <Button
          size="small"
          type="text"
          icon={<ThunderboltOutlined />}
          onClick={handleScan}
          style={{ color: '#facc15' }}
        />
      </Tooltip>
    </div>
  );
}
