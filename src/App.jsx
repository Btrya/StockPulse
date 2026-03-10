import { useState, useEffect } from 'react';
import { Tabs, Tooltip } from 'antd';
import { FilterOutlined, LineChartOutlined, ExperimentOutlined, SearchOutlined, ThunderboltOutlined, LockOutlined } from '@ant-design/icons';
import Layout from './components/Layout';
import ParamPanel from './components/ParamPanel';
import ResultList from './components/ResultList';
import TrackingView from './components/TrackingView';
import BacktestView from './components/BacktestView';
import StockSearch from './components/StockSearch';
import SwingTradeView from './components/SwingTradeView';
import useScreener from './hooks/useScreener';
import useTracking from './hooks/useTracking';
import useBacktest from './hooks/useBacktest';
import useHotData from './hooks/useHotData';
import useSwingTrade from './hooks/useSwingTrade';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { startAntiDebug, stopAntiDebug } from './lib/antiDebug';

function LockedTab({ label }) {
  return (
    <Tooltip title="需要高级权限">
      <span className="text-slate-400">
        <LockOutlined className="mr-1" />{label}
      </span>
    </Tooltip>
  );
}

function AppInner() {
  const screener = useScreener();
  const tracking = useTracking();
  const backtest = useBacktest();
  const swingTrade = useSwingTrade();
  const { hotData } = useHotData();
  const [activeTab, setActiveTab] = useState('screener');
  const { hasRole } = useAuth();

  const isPremium = hasRole('premium');

  // 非 premium 用户启用反调试
  useEffect(() => {
    if (!isPremium) {
      startAntiDebug();
      return () => stopAntiDebug();
    } else {
      stopAntiDebug();
    }
  }, [isPremium]);

  const handleTabChange = (key) => {
    if (!isPremium && ['tracking', 'backtest', 'swing'].includes(key)) return;
    setActiveTab(key);
    if (key === 'tracking') tracking.activate();
  };

  // 共享行业/概念列表（screener 自动加载，作为其他 tab 的 fallback）
  const sharedIndustries = screener.meta?.industries || [];
  const sharedConcepts = screener.meta?.concepts || [];

  const items = [
    {
      key: 'screener',
      label: <span><FilterOutlined /> 筛选</span>,
      children: (
        <>
          <ParamPanel
            params={screener.params}
            setParams={screener.setParams}
            date={screener.date}
            setDate={screener.setDate}
            industries={screener.meta?.industries}
            concepts={screener.meta?.concepts}
            onSearch={screener.scan}
            loading={screener.loading}
            hotData={hotData}
          />
          <ResultList results={screener.results} meta={screener.meta} loading={screener.loading} hotData={hotData} jMode={screener.params.jMode} onlyHot={screener.params.onlyHot} />
        </>
      ),
    },
    {
      key: 'tracking',
      label: isPremium
        ? <span><LineChartOutlined /> 追踪</span>
        : <LockedTab label="追踪" />,
      disabled: !isPremium,
      children: isPremium ? (
        <TrackingView
          params={tracking.params}
          setParams={tracking.setParams}
          date={tracking.date}
          setDate={tracking.setDate}
          results={tracking.results}
          meta={tracking.meta}
          loading={tracking.loading}
          refresh={tracking.refresh}
          sharedIndustries={sharedIndustries}
          sharedConcepts={sharedConcepts}
          hotData={hotData}
        />
      ) : null,
    },
    {
      key: 'backtest',
      label: isPremium
        ? <span><ExperimentOutlined /> 回测</span>
        : <LockedTab label="回测" />,
      disabled: !isPremium,
      children: isPremium ? (
        <BacktestView
          params={backtest.params}
          setParams={backtest.setParams}
          date={backtest.date}
          setDate={backtest.setDate}
          results={backtest.results}
          meta={backtest.meta}
          loading={backtest.loading}
          scanning={backtest.scanning}
          scanInfo={backtest.scanInfo}
          queue={backtest.queue}
          startBacktest={backtest.startBacktest}
          refresh={backtest.refresh}
          cleanup={backtest.cleanup}
          sharedIndustries={sharedIndustries}
          sharedConcepts={sharedConcepts}
          hotData={hotData}
        />
      ) : null,
    },
    {
      key: 'swing',
      label: isPremium
        ? <span><ThunderboltOutlined /> 超短线</span>
        : <LockedTab label="超短线" />,
      disabled: !isPremium,
      children: isPremium ? (
        <SwingTradeView
          subTab={swingTrade.subTab}
          setSubTab={swingTrade.setSubTab}
          date={swingTrade.date}
          setDate={swingTrade.setDate}
          excludeBoards={swingTrade.excludeBoards}
          setExcludeBoards={swingTrade.setExcludeBoards}
          maxGain={swingTrade.maxGain}
          setMaxGain={swingTrade.setMaxGain}
          maxJ={swingTrade.maxJ}
          setMaxJ={swingTrade.setMaxJ}
          arrangement={swingTrade.arrangement}
          setArrangement={swingTrade.setArrangement}
          nearLine={swingTrade.nearLine}
          setNearLine={swingTrade.setNearLine}
          redGtGreen={swingTrade.redGtGreen}
          setRedGtGreen={swingTrade.setRedGtGreen}
          upperLeBody={swingTrade.upperLeBody}
          setUpperLeBody={swingTrade.setUpperLeBody}
          weeklyBull={swingTrade.weeklyBull}
          setWeeklyBull={swingTrade.setWeeklyBull}
          weeklyLowJ={swingTrade.weeklyLowJ}
          setWeeklyLowJ={swingTrade.setWeeklyLowJ}
          dynamicJ={swingTrade.dynamicJ}
          setDynamicJ={swingTrade.setDynamicJ}
          closeAboveShort={swingTrade.closeAboveShort}
          setCloseAboveShort={swingTrade.setCloseAboveShort}
          hasVolumeDouble={swingTrade.hasVolumeDouble}
          setHasVolumeDouble={swingTrade.setHasVolumeDouble}
          hasShrinkingPullback={swingTrade.hasShrinkingPullback}
          setHasShrinkingPullback={swingTrade.setHasShrinkingPullback}
          hasConsecutiveShrink={swingTrade.hasConsecutiveShrink}
          setHasConsecutiveShrink={swingTrade.setHasConsecutiveShrink}
          whiteBelowTwenty={swingTrade.whiteBelowTwenty}
          setWhiteBelowTwenty={swingTrade.setWhiteBelowTwenty}
          onlyHot={swingTrade.onlyHot}
          setOnlyHot={swingTrade.setOnlyHot}
          results={swingTrade.results}
          rawTotal={swingTrade.rawResults.length}
          meta={swingTrade.meta}
          loading={swingTrade.loading}
          hotData={hotData}
        />
      ) : null,
    },
    {
      key: 'search',
      label: <span><SearchOutlined /> 查询</span>,
      children: <StockSearch />,
    },
  ];

  return (
    <Layout scanKlt={screener.params.klt}>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={items}
        size="large"
        className="stock-tabs"
      />
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
