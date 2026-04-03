export default function StoryDetailsLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0c0c0c',
      paddingTop: '78px',
    }}>
      <div style={{
        width: 'min(920px, 100%)',
        margin: '0 auto',
        padding: '0 1rem',
      }}>
        <div style={{
          height: 'clamp(360px, 56vh, 540px)',
          borderRadius: '22px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(110deg, rgba(255,255,255,0.04) 12%, rgba(255,255,255,0.08) 26%, rgba(255,255,255,0.04) 40%)',
          backgroundSize: '240% 100%',
          animation: 'skeletonPulse 1.2s linear infinite',
        }} />
      </div>
      <style>{`
        @keyframes skeletonPulse {
          to { background-position-x: -220%; }
        }
      `}</style>
    </div>
  );
}
