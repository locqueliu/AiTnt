import React, { Suspense, useMemo } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { quickAppsCatalog } from '../apps/loadApps'
import AppLoading from '../../ui/AppLoading'

const QuickAppRunner = React.lazy(() => import('./QuickAppRunner'))
const ProductShotStudio = React.lazy(() => import('../apps/product_shot/ProductShotStudio'))
const ProductShotHome = React.lazy(() => import('../apps/product_shot/ProductShotHome'))

export default function QuickAppEntry() {
  const { appId } = useParams()
  const loc = useLocation()
  const id = String(appId || '').trim()

  const workflow = useMemo(() => (id ? quickAppsCatalog.byId.get(id) : null), [id])
  const isProductShot = workflow?.meta?.id === 'product_shot'
  const view = useMemo(() => {
    try {
      return new URLSearchParams(String(loc.search || '')).get('view') || ''
    } catch {
      return ''
    }
  }, [loc.search])

  return (
    <Suspense fallback={<AppLoading />}>
      {isProductShot ? (view === 'studio' ? <ProductShotStudio /> : <ProductShotHome />) : <QuickAppRunner />}
    </Suspense>
  )
}
