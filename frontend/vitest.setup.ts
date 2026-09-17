import '@testing-library/jest-dom/vitest'

// The mock backend persists to localStorage; every test starts from a clean slate.
beforeEach(() => {
  localStorage.clear()
})
