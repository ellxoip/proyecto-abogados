import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || ''
export const apiUrl = (path: string) => `${API_BASE_URL}${path}`

const api = axios.create({
  baseURL: API_BASE_URL || undefined,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    // Normalize Pydantic 422 validation errors to a readable string
    if (err.response?.status === 422) {
      const detail = err.response.data?.detail
      if (Array.isArray(detail)) {
        err.response.data.detail = detail
          .map((d: any) => {
            const field = d.loc?.slice(1).join('.') ?? ''
            return field ? `${field}: ${d.msg}` : d.msg
          })
          .join(' | ')
      }
    }
    return Promise.reject(err)
  }
)

export default api
