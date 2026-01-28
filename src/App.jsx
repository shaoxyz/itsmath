import { Routes, Route, Link } from 'react-router-dom'
import MetaballGame from './games/MetaballGame'
import SlimeToyGame from './games/SlimeToyGame'
import MetaballThumbnail from './components/MetaballThumbnail'
import SlimeToyThumbnail from './components/SlimeToyThumbnail'

const games = [
  {
    id: 'metaball',
    name: 'Metaball',
    description: '距离场函数产生有机融合\nΣ(r²/d²) > threshold',
    path: '/metaball',
    thumbnail: MetaballThumbnail,
    gradient: 'from-cyan-500 to-blue-600',
  },
  {
    id: 'slime-toy',
    name: 'Slime Tray',
    description: '软体物理模拟史莱姆\n弹簧质点系统 + 体积守恒',
    path: '/slime-toy',
    thumbnail: SlimeToyThumbnail,
    gradient: 'from-green-400 to-emerald-600',
  },
]

function HomePage() {
  return (
    <div className="min-h-screen bg-gray-900 py-12 px-4 select-none" style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 mb-4">
            Mini Games
          </h1>
          <p className="text-gray-400 text-lg">
            一个有趣的小游戏合集
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => {
            const ThumbnailComponent = game.thumbnail;
            return (
              <Link
                key={game.id}
                to={game.path}
                className="group block overflow-hidden bg-gray-800/50 rounded-xl border border-gray-700 hover:border-gray-500 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-500/10"
              >
                <div className="aspect-[4/3] w-full overflow-hidden">
                  {ThumbnailComponent ? (
                    <ThumbnailComponent className="w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl bg-gray-800">
                      {game.emoji}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h2 className={`text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r ${game.gradient} mb-1`}>
                    {game.name}
                  </h2>
                  <p className="text-gray-500 text-xs whitespace-pre-line font-mono">
                    {game.description}
                  </p>
                </div>
              </Link>
            );
          })}

          {/* Placeholder for future games */}
          <div className="p-6 bg-gray-800/30 rounded-xl border border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-500">
            <span className="text-3xl mb-2">+</span>
            <span className="text-sm">更多游戏即将推出</span>
          </div>
        </div>

        <footer className="mt-16 text-center text-gray-600 text-sm">
          <p>Made with React + Vite</p>
        </footer>
      </div>
    </div>
  )
}

function GameWrapper({ children, title }) {
  return (
    <div className="min-h-screen bg-gray-900">
      <Link
        to="/"
        className="fixed top-4 left-4 z-50 px-4 py-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition backdrop-blur"
      >
        ← 返回首页
      </Link>
      {children}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/metaball"
        element={
          <GameWrapper title="Metaball">
            <MetaballGame />
          </GameWrapper>
        }
      />
      <Route
        path="/slime-toy"
        element={
          <GameWrapper title="Slime Tray">
            <SlimeToyGame />
          </GameWrapper>
        }
      />
    </Routes>
  )
}
