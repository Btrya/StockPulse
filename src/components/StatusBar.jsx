import { useState, useEffect } from 'react';
import { Tag } from 'antd';
import { SyncOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { fetchStatus } from '../lib/api';

export default function StatusBar() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => {});
    const id = setInterval(() => {
      fetchStatus().then(setStatus).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, []);

  if (!status) return null;

  if (status.scanning) {
    return <Tag icon={<SyncOutlined spin />} color="processing">扫描中</Tag>;
  }

  const time = status.lastTime
    ? new Date(status.lastTime).toLocaleString('zh-CN', { hour12: false })
    : '--';

  return <Tag icon={<CheckCircleOutlined />} color="default">更新: {time}</Tag>;
}
