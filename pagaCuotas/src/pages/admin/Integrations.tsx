import { UploadCloud, Server, MessageCircle, Bell, CreditCard, Shield, RefreshCw, FileText, Landmark } from 'lucide-react';

export default function Integrations() {
  return (
    <div className="p-6 lg:p-10 w-full overflow-y-auto bg-background-main h-full">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10">
          <h1 className="font-display-lg text-display-lg text-text-charcoal mb-2">Integraciones y Configuración</h1>
          <p className="font-body-base text-on-surface-variant">Conecta tus herramientas favoritas para automatizar la gestión de cobros y comunicaciones.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Base de Datos Section */}
          <section className="bg-surface-container-lowest p-6 rounded-xl border border-border-subtle shadow-sm flex flex-col h-full">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center">
                <Server className="w-6 h-6 text-success-green" />
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md text-primary">Base de Datos</h2>
                <p className="text-body-sm text-on-surface-variant">Sincroniza tus registros maestros</p>
              </div>
            </div>
            <div className="space-y-6 flex-1">
              <div className="p-4 bg-surface-container-low rounded-lg border border-dashed border-outline">
                <div className="flex flex-col items-center text-center space-y-3">
                  <UploadCloud className="w-10 h-10 text-slate-400" />
                  <div>
                    <p className="font-body-base font-semibold text-primary">Subir Archivo Maestro</p>
                    <p className="text-body-sm text-on-surface-variant">Excel o CSV con el listado de clientes</p>
                  </div>
                  <label className="cursor-pointer px-4 py-2 bg-white border border-border-subtle rounded-lg font-label-caps text-primary hover:bg-slate-50 transition-colors">
                    Seleccionar Archivo
                    <input type="file" className="hidden" />
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-white border border-border-subtle rounded-lg flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-green-600" />
                  <span className="font-body-base font-medium">Google Sheets Live</span>
                </div>
                <button className="px-6 py-2 bg-primary text-white rounded-lg font-label-caps hover:bg-primary-container transition-colors">
                  Conectar Cuenta
                </button>
              </div>
            </div>
          </section>

          {/* Comunicaciones Section */}
          <section className="bg-surface-container-lowest p-6 rounded-xl border border-border-subtle shadow-sm flex flex-col h-full">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md text-primary">Comunicaciones</h2>
                <p className="text-body-sm text-on-surface-variant">Automatiza el contacto con clientes</p>
              </div>
            </div>
            <div className="space-y-6 flex-1">
              <div className="flex items-center justify-between p-4 bg-white border border-border-subtle rounded-lg flex-wrap gap-4">
                <div>
                  <p className="font-body-base font-medium">WhatsApp Business API</p>
                  <p className="text-body-sm text-on-surface-variant">Estado: Desconectado</p>
                </div>
                <button className="px-6 py-2 bg-success-green text-white rounded-lg font-label-caps hover:opacity-90 transition-opacity whitespace-nowrap">
                  Conectar WhatsApp
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-lg gap-4">
                  <div className="flex gap-3">
                    <Bell className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-body-base font-medium">Notificaciones Automáticas</p>
                      <p className="text-body-sm text-on-surface-variant">Avisos de cobro y vencimiento</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
                  </label>
                </div>
                <div className="p-4 border border-border-subtle rounded-lg border-l-4 border-l-warning-orange bg-orange-50/50">
                  <p className="text-body-sm text-on-tertiary-fixed-variant">
                    <span className="font-bold">Nota:</span> Se requiere una cuenta de Meta Business configurada para habilitar plantillas de mensaje.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Pasarelas de Pago Section */}
          <section className="lg:col-span-2 bg-surface-container-lowest p-6 rounded-xl border border-border-subtle shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center">
                <CreditCard className="w-8 h-8 text-indigo-600" />
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md text-primary">Pasarelas de Pagos</h2>
                <p className="text-body-sm text-on-surface-variant">Configura cómo tus clientes realizan el pago en CLP</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 border border-green-200 bg-green-50/60 rounded-xl flex flex-col items-center text-center space-y-4">
                <CreditCard className="h-8 w-8 text-red-600" />
                <div className="space-y-1">
                  <h3 className="font-body-base font-bold">Transbank Webpay Plus</h3>
                  <p className="text-body-sm text-on-surface-variant">Principal Chile CLP</p>
                </div>
                <span className="w-full py-2 bg-green-600 text-white rounded-lg font-label-caps">
                  Activo sandbox
                </span>
              </div>

              <div className="p-6 border border-border-subtle rounded-xl flex flex-col items-center text-center space-y-4 hover:border-indigo-400 transition-colors group">
                <Landmark className="h-8 w-8 text-blue-700" />
                <div className="space-y-1">
                  <h3 className="font-body-base font-bold">Flow</h3>
                  <p className="text-body-sm text-on-surface-variant">Tarjetas y transferencias</p>
                </div>
                <span className="w-full py-2 bg-white border border-primary text-primary rounded-lg font-label-caps">
                  Activo sandbox
                </span>
              </div>

              <div className="p-6 border border-border-subtle rounded-xl flex flex-col items-center text-center space-y-4 hover:border-indigo-400 transition-colors group">
                <div className="h-8 flex items-center font-black text-xl text-blue-500 tracking-tighter">MercadoPago</div>
                <div className="space-y-1">
                  <h3 className="font-body-base font-bold">MercadoPago</h3>
                  <p className="text-body-sm text-on-surface-variant">Tarjetas y Efectivo</p>
                </div>
                <span className="w-full py-2 bg-white border border-primary text-primary rounded-lg font-label-caps">Respaldo</span>
              </div>
            </div>
          </section>

          <section className="lg:col-span-2 bg-surface-container-lowest p-6 rounded-xl border border-border-subtle shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center">
                <FileText className="w-8 h-8 text-amber-600" />
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md text-primary">Facturacion SII DTE</h2>
                <p className="text-body-sm text-on-surface-variant">Emision automatica de boletas y facturas via API intermediaria</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                ['Auth.cl API DTE', 'Proveedor inicial API-first', 'Boleta 39 / Factura 33'],
                ['webFactura API', 'Fallback enterprise', 'OAuth 2.0 / masivo'],
                ['SimpleFactura', 'Soporte comercial local', 'Portal + API'],
              ].map(([name, subtitle, detail], index) => (
                <div key={name} className="p-6 border border-border-subtle rounded-xl bg-white">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-body-base font-bold">{name}</h3>
                    <span className={index === 0 ? 'rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700' : 'rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600'}>
                      {index === 0 ? 'Activo' : 'Preparado'}
                    </span>
                  </div>
                  <p className="text-body-sm font-semibold text-primary">{subtitle}</p>
                  <p className="mt-2 text-body-sm text-on-surface-variant">{detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer Summary Card */}
        <div className="mt-8 p-4 bg-primary-container rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 mb-20 md:mb-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <p className="text-white text-body-sm">
              <span className="font-bold">Seguridad de Datos:</span> Todas las conexiones utilizan cifrado AES-256. PagaCuotas no almacena tus credenciales de pago.
            </p>
          </div>
          <button className="px-6 py-2 bg-secondary text-white rounded-lg font-label-caps shadow-lg hover:scale-105 transition-transform shrink-0">
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}
