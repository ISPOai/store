// React has had `useSyncExternalStore` built in since 18, so the CommonJS
// backport package is replaced by React's own implementation.
import { useSyncExternalStore } from 'react'

export { useSyncExternalStore }
export default { useSyncExternalStore }
