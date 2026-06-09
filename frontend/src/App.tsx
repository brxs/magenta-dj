import { useTranslation } from 'react-i18next'

import { Deck } from './deck/Deck'

function App() {
  const { t } = useTranslation()
  return (
    <main className="app">
      <h1 className="app__title">{t('app.title')}</h1>
      <div className="app__decks">
        <Deck id="a" />
      </div>
    </main>
  )
}

export default App
