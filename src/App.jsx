import Layout from './components/Layout';
import ParamPanel from './components/ParamPanel';
import ResultList from './components/ResultList';
import useScreener from './hooks/useScreener';

export default function App() {
  const {
    params,
    setParams,
    results,
    meta,
    loading,
    scan,
  } = useScreener();

  return (
    <Layout>
      <ParamPanel
        params={params}
        setParams={setParams}
        industries={meta?.industries}
        concepts={meta?.concepts}
        onSearch={scan}
        loading={loading}
      />
      <ResultList results={results} meta={meta} loading={loading} />
    </Layout>
  );
}
