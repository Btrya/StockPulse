import { useState, useEffect, useRef, useCallback } from 'react';
import { Tag, Button, Tooltip, Space, message } from 'antd';
import { SyncOutlined, CheckCircleOutlined, ThunderboltOutlined, StopOutlined } from '@ant-design/icons';
import { fetchStatus, triggerScan } from '../lib/api';

export default function StatusBar({ klt }) {
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

  // 轮询续扫（后续轮询不带 klt，从 progress 继续）
  const continueScan = useCallback(async () => {
    try {
      const res = await triggerScan({});
      setScanInfo(res);

      if (res.needContinue) {
        timerRef.current = setTimeout(continueScan, 500);
      } else {
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

  // 手动触发：首次带 klt（仅扫当前周期）
  const handleScan = () => {
    setScanning(true);
    setScanInfo(null);
    triggerScan({ klt }).then(res => {
      if (res.blocked) {
        message.warning(res.error || '市场尚未收盘');
        setScanning(false);
        return;
      }
      setScanInfo(res);
      if (res.needContinue) {
        timerRef.current = setTimeout(continueScan, 500);
      } else {
        setScanning(false);
        setScanInfo(null);
        refreshStatus();
      }
    }).catch(err => {
      console.error('scan failed:', err);
      setScanning(false);
    });
  };

  // 取消扫描
  const handleCancel = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await triggerScan({ cancel: true });
    } catch {}
    setScanning(false);
    setScanInfo(null);
    refreshStatus();
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 检测到 Redis 有未完成进度时自动续扫（部署后恢复）
  useEffect(() => {
    if (status?.scanning && !scanning) {
      setScanning(true);
      setScanInfo(null);
      continueScan();
    }
  }, [status?.scanning]); // eslint-disable-line react-hooks/exhaustive-deps

  // 扫描中：显示进度 + 取消按钮
  if (scanning || status?.scanning) {
    const idx = scanInfo?.idx || status?.progress?.idx || 0;
    const total = scanInfo?.total || status?.progress?.total || 0;
    const scanKlt = scanInfo?.klt || status?.progress?.klt || '';
    const pct = total ? Math.round((idx / total) * 100) : 0;
    return (
      <Space size={4}>
        <Tag icon={<SyncOutlined spin />} color="processing">
          扫描中 {scanKlt === 'weekly' ? '周线' : '日线'} {idx}/{total} ({pct}%)
        </Tag>
        <Tooltip title="取消扫描">
          <Button size="small" type="text" icon={<StopOutlined />} onClick={handleCancel} style={{ color: '#f87171' }} />
        </Tooltip>
      </Space>
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
      <Tooltip title={`手动扫描${klt === 'weekly' ? '周线' : '日线'}（仅当前周期）`}>
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
