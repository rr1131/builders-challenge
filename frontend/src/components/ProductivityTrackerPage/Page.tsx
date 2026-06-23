import MenuWrap from 'components/Menu/MenuWrap'
import React from 'react'

import ProductivityPage from './ProductivityPage'

// This wrapper keeps the productivity tracker mounted inside the shared shell menu.
/**
 * Wraps the productivity tracker dashboard in the shared app shell.
 *
 * @returns Productivity tracker page inside the persistent navigation layout.
 */
const ProductivityTrackerPage: React.FC = () => {
  return <MenuWrap active='ProductivityTracker'><ProductivityPage /></MenuWrap>
}

export default ProductivityTrackerPage
