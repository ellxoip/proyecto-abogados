import { useState } from 'react';
import {
  CreditCard,
  FileText,
  Globe2,
  Landmark,
  ShieldCheck,
  TicketPercent,
  Wallet,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { createPaymentIntent, formatCurrency, getSelectedPayment } from '../../lib/clientPortal';

type PaymentMethodId = 'transbank' | 'flow' | 'wallet';
type PaymentStatus = 'idle' | 'processing' | 'ready' | 'error';

const paymentMethods = [
  {
    id: 'transbank' as const,
    label: 'Webpay Plus',
    icon: CreditCard,
    provider: 'transbank',
    title: 'Transbank Webpay Plus',
    description: 'Seras dirigido a Webpay Plus para pagar con tarjeta de debito, credito o prepago.',
  },
  {
    id: 'flow' as const,
    label: 'Flow',
    icon: Landmark,
    provider: 'flow',
    title: 'Flow',
    description: 'Seras dirigido a Flow para pagar por tarjeta, transferencia u otros medios habilitados.',
  },
  {
    id: 'wallet' as const,
    label: 'MercadoPago',
    icon: Wallet,
    provider: 'mercadopago',
    title: 'MercadoPago',
    description: 'Seras dirigido a MercadoPago para autorizar el pago de forma segura.',
  },
];

export default function Payment() {
  const selectedPayment = getSelectedPayment();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>('transbank');
  const [walletEmail, setWalletEmail] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('Chile');
  const [showCountrySelector, setShowCountrySelector] = useState(false);
  const [showCoupon, setShowCoupon] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponMessage, setCouponMessage] = useState('');
  const [discount, setDiscount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [paymentMessage, setPaymentMessage] = useState('');

  const selectedPaymentMethod = paymentMethods.find((method) => method.id === selectedMethod) ?? paymentMethods[0];
  const amount = selectedPayment?.amount || 0;
  const totalAmount = amount;

  const handleMethodChange = (methodId: PaymentMethodId) => {
    setSelectedMethod(methodId);
    setPaymentStatus('idle');
    setPaymentMessage('');
  };

  const applyCoupon = () => {
    const normalizedCoupon = couponCode.trim().toUpperCase();

    if (!normalizedCoupon) {
      setDiscount(0);
      setCouponMessage('Ingresa un cupon para validarlo.');
      return;
    }

    if (normalizedCoupon === 'PAGACUOTAS10') {
      setDiscount(0);
      setCouponMessage('Cupon reconocido. El monto no se modifica porque SIS.CONTABLE valida el saldo exacto de la cuota.');
      return;
    }

    setDiscount(0);
    setCouponMessage('El cupon ingresado no es valido para esta cuota.');
  };

  const validatePaymentForm = () => {
    if (selectedMethod === 'wallet' && !walletEmail.includes('@')) {
      return 'Ingresa el correo asociado a MercadoPago.';
    }

    if (!selectedPayment) {
      return 'No hay una cuota real seleccionada para pagar. Vuelve al portal y selecciona una cuota.';
    }

    return '';
  };

  const handleBuyNow = async () => {
    const validationMessage = validatePaymentForm();
    if (validationMessage) {
      setPaymentStatus('error');
      setPaymentMessage(validationMessage);
      return;
    }

    setPaymentStatus('processing');
    setPaymentMessage(`Creando intencion de pago con ${selectedPaymentMethod.label}...`);

    try {
      if (!selectedPayment) {
        throw new Error('No hay una cuota seleccionada para crear la intencion de pago.');
      }

      const response = await createPaymentIntent({
        identifier: selectedPayment.identifier,
        cliente_contable_id: selectedPayment.cliente_contable_id,
        contrato_contable_id: selectedPayment.contrato_contable_id,
        cuota_ids: selectedPayment.cuota_ids,
        amount: totalAmount,
        provider: selectedPaymentMethod.provider,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'No se pudo crear la intencion de pago.');
      }

      setPaymentStatus('ready');
      setPaymentMessage('Intencion creada correctamente. Redirigiendo al proveedor de pago...');

      if (data.payment_url) {
        window.location.assign(data.payment_url);
      }
    } catch (error: any) {
      setPaymentStatus('error');
      setPaymentMessage(error.message || 'No fue posible conectar con el procesador de pagos.');
    }
  };

  return (
    <main className="relative min-h-[calc(100vh-4rem)] bg-[#f7f7f7] px-4 py-8 text-[#4d5258] sm:px-6 lg:px-8">
      <div className="absolute inset-x-0 top-0 h-28 bg-[#202337]" />

      <section className="relative mx-auto max-w-[1180px] overflow-hidden rounded-[18px] bg-white shadow-[0_22px_55px_rgba(15,23,42,0.14)]">
        <div className="grid gap-8 p-5 md:p-7 lg:grid-cols-[1fr_374px] lg:p-8">
          <div className="min-w-0">
            <div className="mb-7 grid overflow-hidden rounded-md border border-[#d6d9dd] bg-[#eeeeef] shadow-inner sm:grid-cols-3">
              {[
                ['1', 'Datos personales', 'complete'],
                ['2', 'Pago', 'active'],
                ['3', 'Gracias!', 'pending'],
              ].map(([number, label, status]) => (
                <div
                  key={number}
                  className={cn(
                    'relative flex h-16 items-center gap-3 px-4 text-sm font-semibold',
                    status === 'complete' && 'text-[#63bd56]',
                    status === 'active' && 'text-[#4d83ad]',
                    status === 'pending' && 'text-[#a4a4a4]',
                    number !== '3' && 'after:absolute after:right-[-24px] after:top-0 after:z-10 after:h-16 after:w-12 after:skew-x-[-25deg] after:border-r after:border-[#d7d7d7] after:bg-gradient-to-r after:from-[#eeeeef] after:to-[#f8f8f8]'
                  )}
                >
                  <span
                    className={cn(
                      'relative z-20 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white',
                      status === 'complete' && 'bg-[#6fcf5f]',
                      status === 'active' && 'bg-[#4f93c4]',
                      status === 'pending' && 'bg-[#bfbfbf]'
                    )}
                  >
                    {number}
                  </span>
                  <span className="relative z-20 truncate">{label}</span>
                </div>
              ))}
            </div>

            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {paymentMethods.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleMethodChange(id as PaymentMethodId)}
                  className={cn(
                    'flex h-16 items-center justify-center gap-2 rounded-md border bg-white px-3 text-left text-xs font-semibold transition',
                    selectedMethod === id
                      ? 'border-[#69a5c9] text-[#4f93c4] shadow-[0_0_0_1px_rgba(79,147,196,0.28)]'
                      : 'border-[#d9d9d9] text-[#9b9b9b] hover:border-[#b8c7d2]'
                  )}
                >
                  <Icon className="h-6 w-6 shrink-0" />
                  <span className="leading-tight">{label}</span>
                </button>
              ))}
            </div>

            <div className="rounded-md border border-[#d8d8d8] bg-white">
              <div className="border-b border-[#d8d8d8] p-4">
                <div className="flex items-center gap-2 text-lg font-semibold text-[#8b8f95]">
                  <selectedPaymentMethod.icon className="h-6 w-6 text-[#b6bbc1]" />
                  {selectedPaymentMethod.title}
                </div>
              </div>

              <div className="space-y-5 p-4 md:p-5">
                <div className="rounded-md border border-[#d4d8dd] bg-[#fafafa] p-4 text-sm leading-relaxed text-[#737a82]">
                  {selectedPaymentMethod.description}
                </div>
                {selectedMethod === 'wallet' && (
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-bold uppercase text-[#8b8f95]">
                      Correo MercadoPago
                    </span>
                    <input
                      className="h-12 w-full rounded-md border border-[#d4d8dd] px-4 text-sm outline-none transition focus:border-[#69a5c9] focus:ring-2 focus:ring-[#69a5c9]/20"
                      value={walletEmail}
                      onChange={(event) => setWalletEmail(event.target.value)}
                      type="email"
                      placeholder="correo@ejemplo.com"
                    />
                  </label>
                )}
                <div className="rounded-md border border-[#d6e6d2] bg-[#f6fbf4] p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[#5fae4d]" />
                    <div>
                      <p className="text-sm font-black uppercase tracking-wide text-[#3f7f34]">Facturacion SII automatica</p>
                      <p className="mt-1 text-xs leading-relaxed text-[#66736a]">
                        Al confirmar el pago, PagaCuotas emite boleta electronica tipo 39 mediante API DTE. Factura tipo 33 queda disponible para clientes empresa.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-7 flex justify-center">
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={paymentStatus === 'processing'}
                className="flex h-14 w-full max-w-[260px] items-center justify-center rounded-md bg-[#71c65a] text-lg font-bold text-white shadow-[0_4px_0_#58ae45] transition hover:bg-[#67bd51] active:translate-y-0.5 active:shadow-[0_2px_0_#58ae45] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {paymentStatus === 'processing' ? 'Procesando...' : 'Comprar Ahora'}
              </button>
            </div>
            {paymentMessage && (
              <div
                className={cn(
                  'mx-auto mt-4 max-w-xl rounded-md border px-4 py-3 text-sm font-semibold',
                  paymentStatus === 'error' ? 'border-[#f0b4aa] bg-[#fff4f2] text-[#a23b2d]' : 'border-[#b9ddb0] bg-[#f3fbf1] text-[#3d8736]'
                )}
              >
                {paymentMessage}
              </div>
            )}

            <p className="mt-8 max-w-xl text-[11px] leading-relaxed text-[#9a9a9a]">
              PagaCuotas procesa este pago a traves de un entorno seguro. Al continuar aceptas los Terminos de Compra y las
              politicas de proteccion de datos.
            </p>
          </div>

          <aside className="self-start overflow-hidden rounded-sm border border-[#d5d5d5] bg-[#eeeeee]">
            <div className="flex h-16 items-center justify-end border-b border-[#d5d5d5] bg-[#f0f0f0] px-5 text-[10px] font-bold uppercase text-[#a2a2a2]">
              Powered by <ShieldCheck className="mx-1 h-5 w-5 fill-[#909090] text-[#909090]" /> PagaCuotas
            </div>

            <div className="relative bg-white px-5 pb-8 pt-14">
              <div className="absolute left-[-10px] top-[-24px] flex h-12 items-center gap-3 bg-[#6ecd58] px-5 pr-8 text-sm font-black uppercase text-white shadow-sm">
                <ShieldCheck className="h-6 w-6 fill-white/20" />
                Compra 100 % segura
              </div>
              <div className="mb-6 flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCountrySelector((current) => !current)}
                  className="flex items-center justify-end gap-1 text-xs font-semibold text-[#6b9abf]"
                >
                  <Globe2 className="h-4 w-4" />
                  {selectedCountry} - Cambiar pais
                </button>
                {showCountrySelector && (
                  <div className="grid w-full grid-cols-3 gap-2 rounded-md border border-[#d8d8d8] bg-[#fafafa] p-2">
                    {['Chile', 'Colombia', 'Peru'].map((country) => (
                      <button
                        key={country}
                        type="button"
                        onClick={() => {
                          setSelectedCountry(country);
                          setShowCountrySelector(false);
                        }}
                        className={cn(
                          'rounded-sm border px-2 py-2 text-xs font-bold',
                          selectedCountry === country ? 'border-[#6b9abf] bg-white text-[#4f83aa]' : 'border-transparent text-[#8a8f95]'
                        )}
                      >
                        {country}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <h2 className="mb-4 text-2xl font-black text-[#3f4449]">
                {selectedPayment?.description || 'Selecciona una cuota desde el portal'}
              </h2>
              <p className="mb-3 text-sm text-[#8a8f95]">Precio normal</p>
              <div className="mb-8 flex gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded bg-[#d71955] text-xs font-black text-white">PC</div>
                <div className="text-xs leading-relaxed text-[#8a8f95]">
                  <p>
                    Cliente: <span className="font-semibold">{selectedPayment?.cliente_contable_id || 'Sin cliente seleccionado'}</span>
                  </p>
                  <a href="#" className="text-[#5f94bb] underline">
                    Contacto del vendedor(a)
                  </a>
                </div>
              </div>

              <div className="border-t border-[#d8d8d8] pt-8">
                <div className="mb-1 text-3xl font-black text-[#3f4449]">{formatCurrency(totalAmount)}</div>
                {discount > 0 && <p className="mb-1 text-sm font-bold text-[#60ad4f]">Descuento aplicado: {formatCurrency(discount)}</p>}
                <p className="text-sm leading-relaxed text-[#a0a4a8]">
                  {selectedPayment ? `Cuota ${selectedPayment.installmentNumber} de ${selectedPayment.totalInstallments}` : 'Sin datos de cuota'}
                </p>
                <div className="mt-5 rounded-md border border-[#d8d8d8] bg-[#fafafa] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8d6b16]">DTE SII</p>
                  <p className="mt-1 text-xs font-semibold text-[#626970]">Boleta 39 automatica post pago</p>
                  <p className="mt-1 text-[11px] text-[#8a8f95]">PDF/XML visible en portal cliente.</p>
                </div>
              </div>
            </div>

            <div className="bg-[#eeeeee] px-5 py-6">
              <button
                type="button"
                onClick={() => setShowCoupon((current) => !current)}
                className="mb-5 flex items-center gap-2 text-xs font-bold text-[#6b9abf]"
              >
                <TicketPercent className="h-5 w-5" />
                Tienes un cupon de descuento?
              </button>
              {showCoupon && (
                <div className="mb-5 space-y-2">
                  <div className="flex gap-2">
                    <input
                      className="h-10 min-w-0 flex-1 rounded-sm border border-[#d4d8dd] px-3 text-xs font-semibold uppercase outline-none focus:border-[#69a5c9]"
                      value={couponCode}
                      onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                      placeholder="CUPON"
                    />
                    <button type="button" onClick={applyCoupon} className="rounded-sm bg-[#6b9abf] px-3 text-xs font-bold text-white">
                      Aplicar
                    </button>
                  </div>
                  {couponMessage && <p className="text-xs font-semibold text-[#737a82]">{couponMessage}</p>}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleMethodChange('transbank')}
                  className="flex h-9 min-w-[70px] items-center justify-center rounded-sm bg-white px-3 text-[10px] font-black text-[#d7352a] shadow-sm transition hover:-translate-y-0.5"
                >
                  Webpay
                </button>
                <button
                  type="button"
                  onClick={() => handleMethodChange('flow')}
                  className="flex h-9 min-w-[70px] items-center justify-center rounded-sm bg-white px-3 text-[10px] font-black text-[#234a86] shadow-sm transition hover:-translate-y-0.5"
                >
                  Flow
                </button>
                <button
                  type="button"
                  onClick={() => handleMethodChange('wallet')}
                  className="flex h-9 min-w-[70px] items-center justify-center rounded-sm bg-white px-3 text-[10px] font-black text-[#2d5c9f] shadow-sm transition hover:-translate-y-0.5"
                >
                  MercadoPago
                </button>
              </div>
            </div>
          </aside>
        </div>

        <footer className="border-t border-[#eeeeee] py-5 text-center text-[10px] leading-relaxed text-[#a6a6a6]">
          PagaCuotas © 2026 - Todos los derechos reservados
          <br />
          REF: 57083675B
        </footer>
      </section>
    </main>
  );
}
