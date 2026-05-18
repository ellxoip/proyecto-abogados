import axios from 'axios'

const api = axios.create({
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
