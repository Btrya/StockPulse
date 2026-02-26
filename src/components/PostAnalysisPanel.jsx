import { InputNumber, Checkbox, Button, Progress, Space, Divider } from 'antd';
import { STRATEGY_LABELS, FILTER_LABELS } from '../lib/simulate';

const STRATEGY_PARAMS = {
  fixedStopLoss: { key: 'pct', label: '止损%', min: 1, max: 20 },
  timeStop: { key: 'days', label: '天数', min: 3, max: 30 },
  fixedTakeProfit: { key: 'pct', label: '止盈%', min: 3, max: 50 },
  bigCandleExit: { key: 'days', label: '天数', min: 1, max: 10 },
};

export default function PostAnalysisPanel({
  strategies, setStrategies,
  filters, setFilters,
  window, setWindow,
  loading, progress,
  onStart,
  disabled,
}) {
  const toggleStrategy = (id) => {
    setStrategies(prev => ({
      ...prev,
      [id]: { ...prev[id], enabled: !prev[id]?.enabled },
    }));
  };

  const setParam = (id, key, val) => {
    setStrategies(prev => ({
      ...prev,
      [id]: { ...prev[id], [key]: val },
    }));
  };

  const toggleFilter = (id) => {
    setFilters(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const pct = progress ? Math.round((progress.idx / progress.total) * 100) : 0;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-4 mb-3">
        <label className="text-xs text-slate-400">
          追踪窗口
          <InputNumber
            size="small"
            min={5}
            max={60}
            value={window}
            onChange={setWindow}
            className="ml-1 w-16"
          />
          <span className="ml-1">天</span>
        </label>

        <Button
          type="primary"
          size="small"
          onClick={onStart}
          loading={loading}
          disabled={disabled}
        >
          开始分析
        </Button>
      </div>

      <Divider orientation="left" plain className="!my-2 !text-xs">入场过滤</Divider>
      <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3">
        {Object.entries(FILTER_LABELS).map(([id, label]) => (
          <Checkbox
            key={id}
            checked={filters[id]}
            onChange={() => toggleFilter(id)}
          >
            <span className="text-xs">{label}</span>
          </Checkbox>
        ))}
      </div>

      <Divider orientation="left" plain className="!my-2 !text-xs">退出策略</Divider>
      <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3">
        {Object.entries(STRATEGY_LABELS).map(([id, label]) => {
          const param = STRATEGY_PARAMS[id];
          return (
            <Space key={id} size={4}>
              <Checkbox
                checked={strategies[id]?.enabled}
                onChange={() => toggleStrategy(id)}
              >
                <span className="text-xs">{label}</span>
              </Checkbox>
              {param && strategies[id]?.enabled && (
                <InputNumber
                  size="small"
                  min={param.min}
                  max={param.max}
                  value={strategies[id]?.[param.key]}
                  onChange={v => setParam(id, param.key, v)}
                  className="w-14"
                  addonAfter={param.label.includes('%') ? '%' : undefined}
                />
              )}
            </Space>
          );
        })}
      </div>

      {loading && progress && (
        <Progress
          percent={pct}
          size="small"
          format={() => `${progress.idx}/${progress.total}`}
        />
      )}
    </div>
  );
}
