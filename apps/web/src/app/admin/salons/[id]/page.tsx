'use client';

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Globe2, PackageCheck, Pencil, Plus, Power, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui/primitives';
import { CloudinaryUpload, type UploadedAsset } from '@/components/cloudinary-upload';
import { useToast } from '@/components/ui/toast-provider';
import { eventTypeOptions, menuToText, money, textToMenu, type PackageRule, type Salon, type SalonExtra, type SalonMedia, type UserOption } from '@/features/salons/types';

type Tab = 'general' | 'commercial' | 'packages' | 'extras' | 'landing';
type RuleForm = {
  active: boolean;
  pricePerPerson: number;
  discountPercentage: number;
  depositAmount: number;
  paymentTerms: string;
  promotionText: string;
  giftText: string;
  includedServices: string;
  menuSections: string;
  notes: string;
};
type TemplateForm = {
  name: string;
  durationHours: number;
  startTime: string;
  endTime: string;
  pricePerPerson: number;
  discountPercentage: number;
  depositAmount: number;
  paymentTerms: string;
  promotionText: string;
  giftText: string;
  includedServices: string;
  menuSections: string;
  notes: string;
};

const tabs: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'commercial', label: 'Comercial' },
  { id: 'packages', label: 'Paquetes' },
  { id: 'extras', label: 'Extras' },
  { id: 'landing', label: 'Landing' }
];
const tabIds = tabs.map((item) => item.id);

const emptyExtra: SalonExtra = { name: '', description: '', basePrice: 0, active: true, includedByDefault: false, publicVisible: false };
const emptyTemplate: TemplateForm = { name: '', durationHours: 8, startTime: '21:00', endTime: '05:00', pricePerPerson: 0, discountPercentage: 0, depositAmount: 0, paymentTerms: '', promotionText: '', giftText: '', includedServices: '', menuSections: '', notes: '' };
const toNumber = (value: FormDataEntryValue | null) => Number(value || 0);
const toText = (value: FormDataEntryValue | null) => String(value ?? '');
const assetUrl = (asset: UploadedAsset) => asset.secureUrl || asset.url;
const galleryTextToUrls = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const uniqueUrls = (urls: string[]) => urls.filter(Boolean).filter((url, index, allUrls) => allUrls.indexOf(url) === index);
function cloudinaryImageUrl(url: string): string {
  if (!url || !url.includes('/upload/') || url.includes('/upload/f_auto,q_auto/')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
}
function mediaUrl(url: string, resourceType?: string): string {
  return resourceType === 'image' ? cloudinaryImageUrl(url) : url;
}
function assetDeliveryUrl(asset: UploadedAsset): string {
  const url = assetUrl(asset);
  return asset.resourceType === 'image' ? cloudinaryImageUrl(url) : url;
}
const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && 'code' in error && error.code === 'ROUTE_NOT_FOUND') return 'La API no encontró el endpoint de Salones. Revisá que el backend esté actualizado y en ejecución.';
  return error instanceof Error ? error.message : fallback;
};

function ruleToForm(rule: PackageRule): RuleForm {
  return {
    active: rule.active ?? true,
    pricePerPerson: rule.pricePerPerson ?? 0,
    discountPercentage: rule.discountPercentage ?? 0,
    depositAmount: rule.depositAmount ?? 0,
    paymentTerms: rule.paymentTerms ?? '',
    promotionText: rule.promotionText ?? '',
    giftText: rule.giftText ?? '',
    includedServices: rule.includedServices?.join('\n') ?? '',
    menuSections: menuToText(rule.menuSections),
    notes: rule.notes ?? ''
  };
}

export default function SalonDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const initialTab = searchParams?.get('tab');
  const [tab, setTab] = useState<Tab>(tabIds.includes(initialTab as Tab) ? initialTab as Tab : 'general');
  const [salon, setSalon] = useState<Salon>();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [packageRules, setPackageRules] = useState<PackageRule[]>([]);
  const [extras, setExtras] = useState<SalonExtra[]>([]);
  const [editingRule, setEditingRule] = useState<PackageRule>();
  const [ruleForm, setRuleForm] = useState<RuleForm>();
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplate);
  const [extraForm, setExtraForm] = useState<SalonExtra>(emptyExtra);
  const [editingExtraIndex, setEditingExtraIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNoticeState] = useState('');
  const [landingMedia, setLandingMedia] = useState({ heroImageUrl: '', galleryImageUrlsText: '' });
  const [removeOpen, setRemoveOpen] = useState(false);
  const salonId = params?.id ?? '';

  function setNotice(message: string) {
    setNoticeState(message);
    if (!message) return;
    const isSuccess = /correctamente|cread[ao]s?|guardad[ao]s?|actualizad[ao]s?|activad[ao]s?|desactivad[ao]s?|agregad[ao]s?|subid[ao]s?|eliminad[ao]s?|registrad[ao]s?|duplicad[ao]s?|recibida/i.test(message);
    showToast({ message, variant: isSuccess ? 'success' : 'error' });
  }

  async function load() {
    setLoading(true);
    setNotice('');
    try {
      const [salonResponse, packageResponse, extrasResponse] = await Promise.all([
        api.get<{ salon: Salon }>(`/salons/${salonId}`),
        api.get<{ packageRules: PackageRule[] }>(`/salons/${salonId}/package-rules`),
        api.get<{ extras: SalonExtra[] }>(`/salons/${salonId}/extras`)
      ]);
      setSalon(salonResponse.salon);
      setPackageRules(packageResponse.packageRules ?? []);
      setExtras(extrasResponse.extras ?? []);
      try {
        const usersResponse = await api.get<{ users: UserOption[] }>('/users');
        setUsers((usersResponse.users ?? []).filter((user) => user.active !== false));
      } catch (usersError) {
        setUsers([]);
        setNotice(errorMessage(usersError, 'El salón cargó, pero no se pudieron cargar los usuarios para asignar encargado.'));
      }
    } catch (error) {
      setNotice(errorMessage(error, 'No pudimos cargar el salón.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [salonId]);
  useEffect(() => {
    if (!salon) return;
    setLandingMedia({
      heroImageUrl: cloudinaryImageUrl(salon.heroImageUrl ?? ''),
      galleryImageUrlsText: salon.galleryImageUrls?.map(cloudinaryImageUrl).join('\n') ?? ''
    });
  }, [salon?._id]);

  function selectTab(next: Tab) {
    setTab(next);
    router.replace(`/admin/salons/${salonId}?tab=${next}`);
  }

  function managerLabel(user?: UserOption) {
    if (!user) return 'Sin encargado asignado';
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email;
    const roles = user.roles?.length ? ` · ${user.roles.join(', ')}` : '';
    return `${name}${user.email ? ` · ${user.email}` : ''}${roles}`;
  }

  async function saveSalon(payload: Record<string, unknown>, successMessage: string): Promise<boolean> {
    setSaving(true);
    setNotice('');
    try {
      const response = await api.patch<{ salon: Salon }>(`/salons/${salonId}`, payload);
      setSalon(response.salon);
      setNotice(successMessage);
      return true;
    } catch (error) {
      setNotice(errorMessage(error, 'No se pudo guardar el salón.'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function toggleSalon() {
    if (!salon) return;
    setSaving(true);
    setNotice('');
    try {
      const response = await api.patch<{ salon: Salon }>(`/salons/${salonId}/${salon.active ? 'deactivate' : 'activate'}`);
      setSalon(response.salon);
      setNotice(salon.active ? 'Salón desactivado correctamente.' : 'Salón activado correctamente.');
    } catch (error) {
      setNotice(errorMessage(error, 'No se pudo cambiar el estado.'));
    } finally {
      setSaving(false);
    }
  }

  async function removeSalon() {
    setSaving(true);
    setNotice('');
    try {
      await api.delete(`/salons/${salonId}`);
      router.push('/admin/salons');
    } catch (error) {
      setNotice(errorMessage(error, 'No se pudo eliminar el salón.'));
      setSaving(false);
    }
  }

  async function saveGeneral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveSalon({
      name: toText(form.get('name')),
      city: toText(form.get('city')),
      locality: toText(form.get('locality')),
      province: toText(form.get('province')),
      phone: toText(form.get('phone')),
      whatsapp: toText(form.get('whatsapp')),
      email: toText(form.get('email')),
      managerUserId: toText(form.get('managerUserId')) || undefined,
      minCapacity: toNumber(form.get('minCapacity')),
      maxCapacity: toNumber(form.get('maxCapacity')),
      recommendedCapacity: toNumber(form.get('recommendedCapacity')),
      allowedEventTypes: eventTypeOptions.map(([value]) => value).filter((value) => form.get(`eventType:${value}`)),
      defaultStartTime: toText(form.get('defaultStartTime')),
      defaultEndTime: toText(form.get('defaultEndTime')),
      defaultDurationHours: toNumber(form.get('defaultDurationHours')),
      allowsExtraHour: Boolean(form.get('allowsExtraHour')),
      extraHourPrice: toNumber(form.get('extraHourPrice')),
      operationalNotes: toText(form.get('operationalNotes')),
      internalDescription: toText(form.get('internalDescription'))
    }, 'Datos generales guardados correctamente.');
  }

  async function saveCommercial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveSalon({
      defaultDepositAmount: toNumber(form.get('defaultDepositAmount')),
      minimumDepositAmount: toNumber(form.get('minimumDepositAmount')),
      defaultLateFeePercentage: toNumber(form.get('defaultLateFeePercentage')),
      defaultQuoteValidityDays: toNumber(form.get('defaultQuoteValidityDays')),
      defaultPaymentTerms: toText(form.get('defaultPaymentTerms')),
      defaultContractTerms: toText(form.get('defaultContractTerms')),
      commercialNotes: toText(form.get('commercialNotes'))
    }, 'Configuración comercial guardada correctamente.');
  }

  async function saveLanding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveSalon({
      publicTitle: toText(form.get('publicTitle')),
      publicShortDescription: toText(form.get('publicShortDescription')),
      publicDescription: toText(form.get('publicDescription')),
      slug: toText(form.get('slug')),
      address: toText(form.get('address')),
      visibleOnWebsite: Boolean(form.get('visibleOnWebsite')),
      displayOrder: toNumber(form.get('displayOrder')),
      heroImageUrl: cloudinaryImageUrl(landingMedia.heroImageUrl),
      galleryImageUrls: galleryTextToUrls(landingMedia.galleryImageUrlsText).map(cloudinaryImageUrl),
      seoTitle: toText(form.get('seoTitle')),
      seoDescription: toText(form.get('seoDescription')),
      locationText: toText(form.get('locationText')),
      mapUrl: toText(form.get('mapUrl')),
      instagramUrl: toText(form.get('instagramUrl')),
      facebookUrl: toText(form.get('facebookUrl')),
      tiktokUrl: toText(form.get('tiktokUrl'))
    }, 'Datos públicos guardados correctamente.');
  }

  async function setHeroFromUpload(asset: UploadedAsset) {
    const url = assetDeliveryUrl(asset);
    if (!url) return setNotice('Cloudinary no devolvió una URL válida para la imagen principal.');
    if (await saveSalon({ heroImageUrl: url }, 'Imagen principal actualizada correctamente.')) {
      setLandingMedia((current) => ({ ...current, heroImageUrl: url }));
    }
  }

  async function removeHeroImage() {
    if (await saveSalon({ heroImageUrl: '' }, 'Imagen principal eliminada correctamente.')) {
      setLandingMedia((current) => ({ ...current, heroImageUrl: '' }));
    }
  }

  async function addGalleryAssets(assets: UploadedAsset[]) {
    const baseMedia = salon?.mediaGallery ?? [];
    const incomingMedia: SalonMedia[] = assets.map((asset, index) => {
      const resourceType: SalonMedia['resourceType'] = asset.resourceType === 'video' ? 'video' : asset.resourceType === 'raw' ? 'raw' : 'image';
      const url = mediaUrl(assetUrl(asset), resourceType);
      return {
        url,
        secureUrl: url,
        publicId: asset.publicId,
        resourceType,
        format: asset.format,
        title: asset.originalFilename ?? '',
        altText: asset.originalFilename ?? salon?.name ?? 'M&M Eventos',
        displayOrder: baseMedia.length + index,
        publicVisible: true,
        bytes: asset.bytes,
        width: asset.width,
        height: asset.height,
        duration: asset.duration
      };
    }).filter((item) => item.url);
    if (!incomingMedia.length) return setNotice('Cloudinary no devolvió URLs válidas para los archivos de galería.');
    const nextMedia: SalonMedia[] = [...baseMedia, ...incomingMedia];
    const galleryImageUrls = uniqueUrls([
      ...galleryTextToUrls(landingMedia.galleryImageUrlsText),
      ...nextMedia.filter((item) => item.resourceType === 'image').map((item) => item.secureUrl || item.url)
    ]);
    const message = incomingMedia.length === 1 ? 'Archivo agregado a la galería.' : 'Archivos agregados a la galería.';
    if (await saveSalon({ mediaGallery: nextMedia, galleryImageUrls }, message)) {
      setLandingMedia((current) => ({ ...current, galleryImageUrlsText: galleryImageUrls.join('\n') }));
    }
  }

  async function addGalleryAsset(asset: UploadedAsset) {
    await addGalleryAssets([asset]);
  }

  async function removeGalleryAsset(index: number) {
    const removedMedia = salon?.mediaGallery?.[index];
    const removedUrl = removedMedia ? removedMedia.secureUrl || removedMedia.url : '';
    const nextMedia = (salon?.mediaGallery ?? []).filter((_, itemIndex) => itemIndex !== index);
    const removedUrls = new Set([removedUrl, cloudinaryImageUrl(removedUrl)].filter(Boolean));
    const galleryImageUrls = uniqueUrls(galleryTextToUrls(landingMedia.galleryImageUrlsText).filter((url) => !removedUrls.has(url)));
    if (await saveSalon({ mediaGallery: nextMedia, galleryImageUrls }, 'Archivo eliminado de la galería.')) {
      setLandingMedia((current) => ({ ...current, galleryImageUrlsText: galleryImageUrls.join('\n') }));
      if (removedMedia?.publicId) {
        try {
          await api.delete(`/uploads?context=salons&publicId=${encodeURIComponent(removedMedia.publicId)}&resourceType=${removedMedia.resourceType}`);
        } catch (error) {
          setNotice(errorMessage(error, 'El archivo se quitó del salón, pero no se pudo eliminar de Cloudinary.'));
        }
      }
    }
  }

  function openRule(rule: PackageRule) {
    setEditingRule(rule);
    setRuleForm(ruleToForm(rule));
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRule || !ruleForm) return;
    setSaving(true);
    setNotice('');
    try {
      const price = Number(ruleForm.pricePerPerson || 0);
      const discount = Number(ruleForm.discountPercentage || 0);
      await api.patch(`/salons/${salonId}/package-rules/${editingRule.packageTemplateId}`, {
        active: ruleForm.active,
        pricePerPerson: price,
        discountPercentage: discount,
        finalPricePerPerson: Math.round(price * (1 - discount / 100)),
        depositAmount: Number(ruleForm.depositAmount || 0),
        paymentTerms: ruleForm.paymentTerms,
        promotionText: ruleForm.promotionText,
        giftText: ruleForm.giftText,
        includedServices: ruleForm.includedServices.split('\n').map((item) => item.trim()).filter(Boolean),
        menuSections: textToMenu(ruleForm.menuSections),
        notes: ruleForm.notes
      });
      setEditingRule(undefined);
      setRuleForm(undefined);
      setNotice('Regla de paquete guardada correctamente.');
      await load();
    } catch (error) {
      setNotice(errorMessage(error, 'No se pudo guardar la regla del paquete.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!templateForm.name.trim()) return setNotice('El nombre del paquete es obligatorio.');
    setSaving(true);
    setNotice('');
    try {
      const price = Number(templateForm.pricePerPerson || 0);
      const discount = Number(templateForm.discountPercentage || 0);
      await api.post('/quotes/packages', {
        name: templateForm.name.trim(),
        active: true,
        isGlobal: true,
        durationHours: Number(templateForm.durationHours || 8),
        startTime: templateForm.startTime,
        endTime: templateForm.endTime,
        pricePerPerson: price,
        discountPercentage: discount,
        finalPricePerPerson: Math.round(price * (1 - discount / 100)),
        depositAmount: Number(templateForm.depositAmount || 0),
        paymentTerms: templateForm.paymentTerms,
        promotionText: templateForm.promotionText,
        giftText: templateForm.giftText,
        includedServices: templateForm.includedServices.split('\n').map((item) => item.trim()).filter(Boolean),
        menuSections: textToMenu(templateForm.menuSections),
        notes: templateForm.notes
      });
      setTemplateOpen(false);
      setTemplateForm(emptyTemplate);
      setNotice('Plantilla global de paquete creada correctamente. Ahora podés editar su regla para este salón.');
      await load();
    } catch (error) {
      setNotice(errorMessage(error, 'No se pudo crear la plantilla global del paquete.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveExtras(nextExtras: SalonExtra[]) {
    setSaving(true);
    setNotice('');
    try {
      const response = await api.patch<{ extras: SalonExtra[] }>(`/salons/${salonId}/extras`, { extras: nextExtras });
      setExtras(response.extras ?? []);
      setNotice('Extras guardados correctamente.');
    } catch (error) {
      setNotice(errorMessage(error, 'No se pudieron guardar los extras.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveExtra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!extraForm.name.trim()) return setNotice('El nombre del extra es obligatorio.');
    const next = [...extras];
    if (editingExtraIndex === null) next.push(extraForm);
    else next[editingExtraIndex] = extraForm;
    setExtraForm(emptyExtra);
    setEditingExtraIndex(null);
    await saveExtras(next);
  }

  if (loading) return <section className="rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500">Cargando salón…</section>;
  if (!salon) return <section className="space-y-4"><Link href="/admin/salons" className="inline-flex items-center gap-2 text-sm text-zinc-600"><ArrowLeft className="h-4 w-4" />Volver a Salones</Link><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{notice || 'No se encontró el salón.'}</p></section>;

  return <section className="space-y-6">
    <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <Link href="/admin/salons" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950"><ArrowLeft className="h-4 w-4" />Volver a Salones</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{salon.name}</h1><p className="mt-1 text-sm text-zinc-500">{salon.locality || salon.city || 'Sin localidad'} · {salon.address || 'Sin dirección'}</p><div className="mt-3 flex flex-wrap gap-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${salon.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{salon.active ? 'Activo' : 'Inactivo'}</span><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${salon.visibleOnWebsite !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>{salon.visibleOnWebsite !== false ? 'Visible en web' : 'Oculto en web'}</span></div></div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => selectTab('general')}><Pencil className="mr-2 h-4 w-4" />Editar</Button><Button variant="secondary" disabled={saving} onClick={() => void toggleSalon()}><Power className="mr-2 h-4 w-4" />{salon.active ? 'Desactivar' : 'Activar'}</Button><Button variant="danger" disabled={saving} onClick={() => setRemoveOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Eliminar</Button></div>
      </div>
    </header>
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm" aria-label="Secciones del salón">
      {tabs.map((item) => <button key={item.id} type="button" onClick={() => selectTab(item.id)} className={`rounded-xl px-4 py-2 text-sm font-medium ${tab === item.id ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>{item.label}</button>)}
    </nav>
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-zinc-950">Encargado del salón</h2>
      {salon.manager ? <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4"><Metric label="Nombre" value={[salon.manager.firstName, salon.manager.lastName].filter(Boolean).join(' ') || 'Sin nombre'} /><Metric label="Email" value={salon.manager.email || 'Sin email'} /><Metric label="Teléfono" value={salon.manager.phone || 'Sin teléfono'} /><Metric label="Rol" value={salon.manager.roles?.join(', ') || 'Sin rol'} /></dl> : <p className="mt-2 text-sm text-zinc-500">Sin encargado asignado.</p>}
    </article>
    {tab === 'general' && <form onSubmit={saveGeneral} className="grid gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:grid-cols-3">
      <Field label="Nombre interno"><Input name="name" defaultValue={salon.name} required /></Field><Field label="Localidad"><Input name="locality" defaultValue={salon.locality || salon.city} /></Field>
      <Field label="Ciudad"><Input name="city" defaultValue={salon.city} /></Field><Field label="Provincia"><Input name="province" defaultValue={salon.province} /></Field>
      <Field label="Teléfono"><Input name="phone" defaultValue={salon.phone} /></Field><Field label="WhatsApp"><Input name="whatsapp" defaultValue={salon.whatsapp} /></Field><Field label="Email"><Input name="email" type="email" defaultValue={salon.email} /></Field>
      <Field label="Encargado del salón"><Select name="managerUserId" defaultValue={typeof salon.managerUserId === 'string' ? salon.managerUserId : salon.manager?._id ?? ''}><option value="">Sin encargado asignado</option>{users.map((user) => <option key={user._id} value={user._id}>{managerLabel(user)}</option>)}</Select></Field>
      <Field label="Capacidad mínima"><Input name="minCapacity" type="number" min={0} defaultValue={salon.minCapacity ?? 0} /></Field><Field label="Capacidad máxima"><Input name="maxCapacity" type="number" min={0} defaultValue={salon.maxCapacity ?? 0} /></Field><Field label="Capacidad recomendada"><Input name="recommendedCapacity" type="number" min={0} defaultValue={salon.recommendedCapacity ?? 0} /></Field>
      <div className="lg:col-span-3"><p className="text-sm font-medium text-zinc-700">Tipos de evento permitidos</p><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{eventTypeOptions.map(([value, label]) => <label key={value} className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm"><input name={`eventType:${value}`} type="checkbox" defaultChecked={salon.allowedEventTypes?.includes(value)} />{label}</label>)}</div></div>
      <Field label="Hora de inicio default"><Input name="defaultStartTime" defaultValue={salon.defaultStartTime} placeholder="21:00" /></Field><Field label="Hora de fin default"><Input name="defaultEndTime" defaultValue={salon.defaultEndTime} placeholder="05:00" /></Field><Field label="Duración default"><Input name="defaultDurationHours" type="number" min={1} defaultValue={salon.defaultDurationHours ?? 8} /></Field>
      <label className="flex items-center gap-2 text-sm text-zinc-700"><input name="allowsExtraHour" type="checkbox" defaultChecked={salon.allowsExtraHour} />Permite hora extra</label><Field label="Precio hora extra"><Input name="extraHourPrice" type="number" min={0} defaultValue={salon.extraHourPrice ?? 0} /></Field>
      <Field label="Descripción interna" className="lg:col-span-3"><Textarea name="internalDescription" defaultValue={salon.internalDescription} /></Field><Field label="Notas operativas" className="lg:col-span-3"><Textarea name="operationalNotes" defaultValue={salon.operationalNotes} /></Field>
      <footer className="lg:col-span-3 flex justify-end"><Button disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando…' : 'Guardar general'}</Button></footer>
    </form>}
    {tab === 'commercial' && <form onSubmit={saveCommercial} className="grid gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:grid-cols-3">
      <Field label="Seña sugerida"><Input name="defaultDepositAmount" type="number" min={0} defaultValue={salon.defaultDepositAmount ?? 0} /></Field><Field label="Seña mínima"><Input name="minimumDepositAmount" type="number" min={0} defaultValue={salon.minimumDepositAmount ?? 0} /></Field><Field label="Interés por mora (%)"><Input name="defaultLateFeePercentage" type="number" min={0} max={100} defaultValue={salon.defaultLateFeePercentage ?? 0} /></Field>
      <Field label="Días de validez del presupuesto"><Input name="defaultQuoteValidityDays" type="number" min={1} defaultValue={salon.defaultQuoteValidityDays ?? 7} /></Field><Field label="Condiciones de pago default" className="lg:col-span-2"><Textarea name="defaultPaymentTerms" defaultValue={salon.defaultPaymentTerms} /></Field>
      <Field label="Condiciones contractuales default" className="lg:col-span-3"><Textarea name="defaultContractTerms" defaultValue={salon.defaultContractTerms} /></Field><Field label="Notas comerciales" className="lg:col-span-3"><Textarea name="commercialNotes" defaultValue={salon.commercialNotes} /></Field>
      <footer className="lg:col-span-3 flex justify-end"><Button disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando…' : 'Guardar comercial'}</Button></footer>
    </form>}
    {tab === 'packages' && <div className="grid gap-4"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div><h2 className="font-semibold text-zinc-950">Paquetes globales y reglas del salón</h2><p className="mt-1 text-sm text-zinc-500">Creá plantillas globales y configurá los valores específicos para {salon.name}.</p></div><Button onClick={() => setTemplateOpen(true)}><Plus className="mr-2 h-4 w-4" />Nuevo paquete global</Button></div>{packageRules.map((rule) => {
      const final = Math.round((rule.pricePerPerson ?? 0) * (1 - (rule.discountPercentage ?? 0) / 100));
      return <article key={rule.packageTemplateId} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="flex items-center gap-2 font-semibold text-zinc-950"><PackageCheck className="h-4 w-4" />{rule.packageName}</h2><p className="mt-1 text-sm text-zinc-500">{rule.ruleConfigured ? 'Regla específica del salón' : 'Sin regla configurada para este salón'}</p></div><Button variant="secondary" onClick={() => openRule(rule)}><Pencil className="mr-2 h-4 w-4" />Editar regla</Button></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5"><Metric label="Estado" value={rule.active === false ? 'Inactivo' : 'Activo'} /><Metric label="Valor/persona" value={money(rule.pricePerPerson)} /><Metric label="Descuento" value={`${rule.discountPercentage ?? 0}%`} /><Metric label="Final/persona" value={money(rule.finalPricePerPerson ?? final)} /><Metric label="Seña" value={money(rule.depositAmount)} /></dl><div className="mt-4 grid gap-3 text-sm lg:grid-cols-3"><Metric label="Promoción" value={rule.promotionText || 'Sin promoción'} /><Metric label="Regalo" value={rule.giftText || 'Sin regalo'} /><Metric label="Condiciones" value={rule.paymentTerms || 'Sin condiciones'} /></div></article>;
    })}</div>}
    {tab === 'extras' && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">{extras.map((extra, index) => <article key={extra._id ?? `${extra.name}-${index}`} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-semibold text-zinc-950">{extra.name}</h2><p className="mt-1 text-sm text-zinc-500">{extra.description || 'Sin descripción'}</p></div><div className="flex gap-2"><Button variant="secondary" onClick={() => { setExtraForm(extra); setEditingExtraIndex(index); }}><Pencil className="mr-2 h-4 w-4" />Editar</Button><Button variant="secondary" onClick={() => void saveExtras(extras.map((item, itemIndex) => itemIndex === index ? { ...item, active: !item.active } : item))}>{extra.active ? 'Desactivar' : 'Activar'}</Button><Button variant="danger" onClick={() => void saveExtras(extras.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="mr-2 h-4 w-4" />Eliminar</Button></div></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4"><Metric label="Precio sugerido" value={money(extra.basePrice)} /><Metric label="Estado" value={extra.active ? 'Activo' : 'Inactivo'} /><Metric label="Tipo" value={extra.includedByDefault ? 'Incluido' : 'Adicional'} /><Metric label="Web" value={extra.publicVisible ? 'Visible' : 'Oculto'} /></dl></article>)}
      {!extras.length && <p className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">Todavía no hay extras configurados para este salón.</p>}</div>
      <form onSubmit={saveExtra} className="h-fit rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-semibold text-zinc-950"><Plus className="h-4 w-4" />{editingExtraIndex === null ? 'Nuevo extra' : 'Editar extra'}</h2><div className="mt-4 grid gap-3"><Field label="Nombre"><Input value={extraForm.name} onChange={(event) => setExtraForm((current) => ({ ...current, name: event.target.value }))} required /></Field><Field label="Descripción"><Textarea value={extraForm.description} onChange={(event) => setExtraForm((current) => ({ ...current, description: event.target.value }))} /></Field><Field label="Precio sugerido"><Input type="number" min={0} value={extraForm.basePrice} onChange={(event) => setExtraForm((current) => ({ ...current, basePrice: Number(event.target.value) }))} /></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={extraForm.active} onChange={(event) => setExtraForm((current) => ({ ...current, active: event.target.checked }))} />Activo</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={extraForm.includedByDefault} onChange={(event) => setExtraForm((current) => ({ ...current, includedByDefault: event.target.checked }))} />Incluido por defecto</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={extraForm.publicVisible} onChange={(event) => setExtraForm((current) => ({ ...current, publicVisible: event.target.checked }))} />Visible en web</label><Button disabled={saving}>{saving ? 'Guardando…' : 'Guardar extra'}</Button></div></form>
    </div>}
    {tab === 'landing' && <form onSubmit={saveLanding} className="grid gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:grid-cols-2">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 lg:col-span-2"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold text-zinc-950">Imagen principal</h2><p className="mt-1 text-sm text-zinc-500">Se sube a Cloudinary y queda disponible para la futura landing.</p></div><div className="flex flex-wrap gap-2"><CloudinaryUpload context="salons" salonId={salonId} accept="image/*,.heic,.heif" label={salon.heroImageUrl ? 'Cambiar imagen principal' : 'Subir imagen principal'} onUploaded={(asset) => void setHeroFromUpload(asset)} />{salon.heroImageUrl ? <Button type="button" variant="danger" onClick={() => void removeHeroImage()}><Trash2 className="mr-2 h-4 w-4" />Quitar imagen</Button> : null}</div></div>{salon.heroImageUrl && <div className="mt-4 h-56 rounded-xl border border-zinc-200 bg-cover bg-center" style={{ backgroundImage: `url(${cloudinaryImageUrl(salon.heroImageUrl)})` }} />}</div>
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 lg:col-span-2"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold text-zinc-950">Galería de imágenes y videos</h2><p className="mt-1 text-sm text-zinc-500">Acepta imágenes y videos. Los archivos se guardan en Cloudinary.</p></div><CloudinaryUpload context="salons" salonId={salonId} accept="image/*,.heic,.heif,video/*" label="Subir a galería" multiple onUploaded={(asset) => void addGalleryAsset(asset)} onUploadedBatch={(assets) => void addGalleryAssets(assets)} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(salon.mediaGallery ?? []).map((item, index) => <article key={item.publicId ?? item.url} className="overflow-hidden rounded-xl border border-zinc-200 bg-white"><div className="grid h-36 place-items-center bg-zinc-100">{item.resourceType === 'video' ? <video src={item.secureUrl || item.url} className="h-full w-full object-cover" controls /> : <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${mediaUrl(item.secureUrl || item.url, item.resourceType)})` }} />}</div><div className="p-3"><p className="truncate text-sm font-medium text-zinc-800">{item.title || item.publicId || 'Archivo de galería'}</p><p className="mt-1 text-xs text-zinc-500">{item.resourceType === 'video' ? 'Video' : 'Imagen'} · {item.publicVisible ? 'Visible' : 'Oculto'}</p><Button type="button" variant="danger" className="mt-3 w-full" onClick={() => void removeGalleryAsset(index)}>Eliminar</Button></div></article>)}{!(salon.mediaGallery ?? []).length && <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">Todavía no hay archivos en la galería.</p>}</div></div>
      <Field label="Título público"><Input name="publicTitle" defaultValue={salon.publicTitle} /></Field><Field label="Slug público"><Input name="slug" defaultValue={salon.slug} required /></Field>
      <Field label="Descripción corta" className="lg:col-span-2"><Textarea name="publicShortDescription" defaultValue={salon.publicShortDescription} /></Field><Field label="Descripción pública" className="lg:col-span-2"><Textarea name="publicDescription" defaultValue={salon.publicDescription} /></Field>
      <label className="flex items-center gap-2 text-sm text-zinc-700"><input name="visibleOnWebsite" type="checkbox" defaultChecked={salon.visibleOnWebsite} />Visible en web</label><Field label="Orden de aparición"><Input name="displayOrder" type="number" min={0} defaultValue={salon.displayOrder ?? 0} /></Field>
      <Field label="URL imagen principal"><Input name="heroImageUrl" value={landingMedia.heroImageUrl} onChange={(event) => setLandingMedia((current) => ({ ...current, heroImageUrl: event.target.value }))} /></Field><Field label="Dirección pública"><Input name="address" defaultValue={salon.address} /></Field><Field label="Ubicación visible"><Input name="locationText" defaultValue={salon.locationText} /></Field>
      <Field label="URLs de galería (una por línea)" className="lg:col-span-2"><Textarea name="galleryImageUrls" value={landingMedia.galleryImageUrlsText} onChange={(event) => setLandingMedia((current) => ({ ...current, galleryImageUrlsText: event.target.value }))} /></Field><Field label="SEO title"><Input name="seoTitle" defaultValue={salon.seoTitle} /></Field><Field label="SEO description"><Input name="seoDescription" defaultValue={salon.seoDescription} /></Field>
      <Field label="Instagram"><Input name="instagramUrl" defaultValue={salon.instagramUrl} placeholder="https://instagram.com/..." /></Field><Field label="Facebook"><Input name="facebookUrl" defaultValue={salon.facebookUrl} placeholder="https://facebook.com/..." /></Field><Field label="TikTok"><Input name="tiktokUrl" defaultValue={salon.tiktokUrl} placeholder="https://tiktok.com/@..." /></Field>
      <Field label="URL de mapa" className="lg:col-span-2"><Input name="mapUrl" defaultValue={salon.mapUrl} /></Field>
      <footer className="lg:col-span-2 flex justify-end"><Button disabled={saving}><Globe2 className="mr-2 h-4 w-4" />{saving ? 'Guardando…' : 'Guardar landing'}</Button></footer>
    </form>}
    <Modal open={Boolean(editingRule && ruleForm)} onClose={() => { setEditingRule(undefined); setRuleForm(undefined); }} title={`Editar regla · ${editingRule?.packageName ?? ''}`} description="Estos cambios afectan sólo la regla del salón, no la plantilla global del paquete.">
      {ruleForm && <form onSubmit={saveRule} className="grid gap-4 p-6 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2"><input type="checkbox" checked={ruleForm.active} onChange={(event) => setRuleForm((current) => current && { ...current, active: event.target.checked })} />Paquete activo para este salón</label>
        <Field label="Valor por persona"><Input type="number" min={0} value={ruleForm.pricePerPerson} onChange={(event) => setRuleForm((current) => current && { ...current, pricePerPerson: Number(event.target.value) })} /></Field><Field label="Descuento (%)"><Input type="number" min={0} max={100} value={ruleForm.discountPercentage} onChange={(event) => setRuleForm((current) => current && { ...current, discountPercentage: Number(event.target.value) })} /></Field>
        <Field label="Final por persona"><Input disabled value={Math.round(ruleForm.pricePerPerson * (1 - ruleForm.discountPercentage / 100))} /></Field><Field label="Seña"><Input type="number" min={0} value={ruleForm.depositAmount} onChange={(event) => setRuleForm((current) => current && { ...current, depositAmount: Number(event.target.value) })} /></Field>
        <Field label="Promoción" className="sm:col-span-2"><Textarea value={ruleForm.promotionText} onChange={(event) => setRuleForm((current) => current && { ...current, promotionText: event.target.value })} /></Field><Field label="Regalo" className="sm:col-span-2"><Textarea value={ruleForm.giftText} onChange={(event) => setRuleForm((current) => current && { ...current, giftText: event.target.value })} /></Field>
        <Field label="Condiciones de pago" className="sm:col-span-2"><Textarea value={ruleForm.paymentTerms} onChange={(event) => setRuleForm((current) => current && { ...current, paymentTerms: event.target.value })} /></Field><Field label="Menú" className="sm:col-span-2"><Textarea value={ruleForm.menuSections} onChange={(event) => setRuleForm((current) => current && { ...current, menuSections: event.target.value })} placeholder="Recepción: ítem | ítem" /></Field>
        <Field label="Servicios incluidos" className="sm:col-span-2"><Textarea value={ruleForm.includedServices} onChange={(event) => setRuleForm((current) => current && { ...current, includedServices: event.target.value })} placeholder="Un servicio por línea" /></Field><Field label="Notas" className="sm:col-span-2"><Textarea value={ruleForm.notes} onChange={(event) => setRuleForm((current) => current && { ...current, notes: event.target.value })} /></Field>
        <footer className="flex justify-end gap-3 sm:col-span-2"><Button type="button" variant="secondary" onClick={() => { setEditingRule(undefined); setRuleForm(undefined); }}>Cancelar</Button><Button disabled={saving}><Check className="mr-2 h-4 w-4" />{saving ? 'Guardando…' : 'Guardar regla'}</Button></footer>
      </form>}
    </Modal>
    <Modal open={templateOpen} onClose={() => setTemplateOpen(false)} title="Nuevo paquete global" description="Crea una plantilla global disponible para todos los salones. Luego se configura la regla específica de cada salón.">
      <form onSubmit={saveTemplate} className="grid gap-4 p-6 sm:grid-cols-2">
        <Field label="Nombre del paquete" className="sm:col-span-2"><Input value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej: Golden Night" required /></Field>
        <Field label="Duración"><Input type="number" min={1} value={templateForm.durationHours} onChange={(event) => setTemplateForm((current) => ({ ...current, durationHours: Number(event.target.value) }))} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Inicio"><Input value={templateForm.startTime} onChange={(event) => setTemplateForm((current) => ({ ...current, startTime: event.target.value }))} /></Field><Field label="Fin"><Input value={templateForm.endTime} onChange={(event) => setTemplateForm((current) => ({ ...current, endTime: event.target.value }))} /></Field></div>
        <Field label="Valor por persona"><Input type="number" min={0} value={templateForm.pricePerPerson} onChange={(event) => setTemplateForm((current) => ({ ...current, pricePerPerson: Number(event.target.value) }))} /></Field>
        <Field label="Descuento (%)"><Input type="number" min={0} max={100} value={templateForm.discountPercentage} onChange={(event) => setTemplateForm((current) => ({ ...current, discountPercentage: Number(event.target.value) }))} /></Field>
        <Field label="Final por persona"><Input disabled value={Math.round(templateForm.pricePerPerson * (1 - templateForm.discountPercentage / 100))} /></Field>
        <Field label="Seña"><Input type="number" min={0} value={templateForm.depositAmount} onChange={(event) => setTemplateForm((current) => ({ ...current, depositAmount: Number(event.target.value) }))} /></Field>
        <Field label="Promoción" className="sm:col-span-2"><Textarea value={templateForm.promotionText} onChange={(event) => setTemplateForm((current) => ({ ...current, promotionText: event.target.value }))} /></Field>
        <Field label="Regalo" className="sm:col-span-2"><Textarea value={templateForm.giftText} onChange={(event) => setTemplateForm((current) => ({ ...current, giftText: event.target.value }))} /></Field>
        <Field label="Condiciones de pago" className="sm:col-span-2"><Textarea value={templateForm.paymentTerms} onChange={(event) => setTemplateForm((current) => ({ ...current, paymentTerms: event.target.value }))} /></Field>
        <Field label="Menú" className="sm:col-span-2"><Textarea value={templateForm.menuSections} onChange={(event) => setTemplateForm((current) => ({ ...current, menuSections: event.target.value }))} placeholder="Recepción: ítem | ítem" /></Field>
        <Field label="Servicios incluidos" className="sm:col-span-2"><Textarea value={templateForm.includedServices} onChange={(event) => setTemplateForm((current) => ({ ...current, includedServices: event.target.value }))} placeholder="Un servicio por línea" /></Field>
        <Field label="Notas internas" className="sm:col-span-2"><Textarea value={templateForm.notes} onChange={(event) => setTemplateForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
        <footer className="flex justify-end gap-3 sm:col-span-2"><Button type="button" variant="secondary" onClick={() => setTemplateOpen(false)}>Cancelar</Button><Button disabled={saving}>{saving ? 'Creando…' : 'Crear paquete global'}</Button></footer>
      </form>
    </Modal>
    <Modal open={removeOpen} onClose={() => setRemoveOpen(false)} title="Eliminar salón" description="El salón se eliminará con borrado lógico.">
      <div className="p-6"><p className="text-sm text-zinc-600">¿Querés eliminar {salon.name}? No se modifican presupuestos ya creados, pero el salón dejará de estar disponible para nuevas operaciones.</p><footer className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => setRemoveOpen(false)}>Cancelar</Button><Button variant="danger" disabled={saving} onClick={() => void removeSalon()}>{saving ? 'Eliminando…' : 'Eliminar'}</Button></footer></div>
    </Modal>
  </section>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block text-sm font-medium text-zinc-700 ${className}`}><span className="mb-1.5 block">{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase tracking-wide text-zinc-400">{label}</dt><dd className="mt-1 font-medium text-zinc-800">{value}</dd></div>;
}
