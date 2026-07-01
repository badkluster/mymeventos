'use client';

import { FormEvent, useState } from 'react';
import { Camera, KeyRound, Save, Trash2, UserRound } from 'lucide-react';
import { Button, Input, PageHeader } from '@/components/ui/primitives';
import { useSession } from '@/components/session-provider';
import { useToast } from '@/components/ui/toast-provider';
import { CloudinaryUpload } from '@/components/cloudinary-upload';
import { changePassword, updateProfile } from '@/lib/auth';

function initials(firstName?: string, lastName?: string, username?: string) {
  const nameInitials = [firstName, lastName].filter(Boolean).map((part) => part?.[0]).join('').slice(0, 2);
  return (nameInitials || username?.slice(0, 2) || 'MM').toUpperCase();
}

export default function AdminProfilePage() {
  const { user, refreshSession } = useSession();
  const { showToast } = useToast();
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSavingProfile(true);
    try {
      await updateProfile({
        firstName: String(data.get('firstName') ?? ''),
        lastName: String(data.get('lastName') ?? ''),
        email: String(data.get('email') ?? ''),
        phone: String(data.get('phone') ?? ''),
        documentType: String(data.get('documentType') ?? ''),
        documentNumber: String(data.get('documentNumber') ?? ''),
        avatarUrl: String(data.get('avatarUrl') ?? ''),
      });
      await refreshSession();
      showToast({ message: 'Perfil actualizado correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo actualizar el perfil.', variant: 'error' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get('newPassword') ?? '');
    const confirmPassword = String(data.get('confirmPassword') ?? '');
    if (newPassword !== confirmPassword) {
      showToast({ message: 'La nueva contraseña y la confirmación no coinciden.', variant: 'error' });
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword({ currentPassword: String(data.get('currentPassword') ?? ''), newPassword });
      form.reset();
      showToast({ message: 'Contraseña actualizada correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo cambiar la contraseña.', variant: 'error' });
    } finally {
      setSavingPassword(false);
    }
  }

  if (!user) return <div className="grid min-h-56 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Cargando perfil...</div>;

  const displayName = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;

  return <section className="space-y-6 pb-8">
    <PageHeader title="Mi perfil" description="Gestioná tus datos personales, avatar y contraseña de acceso al backoffice." />

    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <aside className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-950 text-2xl font-semibold text-white">
            {avatarPreview ? <span aria-label={displayName} role="img" className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${avatarPreview})` }} /> : initials(user.firstName, user.lastName, user.username)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold text-zinc-950">{displayName}</p>
            <p className="mt-1 truncate text-sm text-zinc-500">{user.email || user.username}</p>
            <div className="mt-3 flex flex-wrap gap-2">{(user.roles ?? []).map((role) => <span key={role} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">{role}</span>)}</div>
          </div>
        </div>
        <p className="mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">Los cambios de nombre, contacto y avatar impactan en el encabezado del backoffice después de guardar.</p>
      </aside>

      <form onSubmit={(event) => void saveProfile(event)} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-600"><UserRound className="h-5 w-5" /></span><div><h2 className="font-semibold text-zinc-950">Datos básicos y personales</h2><p className="text-sm text-zinc-500">Información visible para operaciones internas.</p></div></div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-zinc-700">Nombre<Input name="firstName" required defaultValue={user.firstName} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Apellido<Input name="lastName" required defaultValue={user.lastName} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Email<Input name="email" type="email" defaultValue={user.email ?? ''} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Teléfono<Input name="phone" defaultValue={user.phone ?? ''} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Tipo de documento<Input name="documentType" defaultValue={user.documentType ?? ''} placeholder="DNI, CUIT..." className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Número de documento<Input name="documentNumber" defaultValue={user.documentNumber ?? ''} className="mt-1.5" /></label>
          <div className="md:col-span-2">
            <p className="text-sm font-medium text-zinc-700">Avatar</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <CloudinaryUpload context="users" accept="image/*" label="Subir avatar" onUploaded={(asset) => setAvatarPreview(asset.secureUrl || asset.url)} />
              {avatarPreview ? <Button type="button" variant="danger" onClick={() => setAvatarPreview('')}><Trash2 className="mr-2 h-4 w-4" />Quitar avatar</Button> : null}
              <span className="inline-flex items-center gap-2 text-sm text-zinc-500"><Camera className="h-4 w-4" />La imagen se guarda en la nube.</span>
            </div>
            <input type="hidden" name="avatarUrl" value={avatarPreview} />
          </div>
        </div>
        <footer className="mt-6 flex justify-end"><Button disabled={savingProfile}><Save className="mr-2 h-4 w-4" />{savingProfile ? 'Guardando...' : 'Guardar perfil'}</Button></footer>
      </form>
    </div>

    <form onSubmit={(event) => void savePassword(event)} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-600"><KeyRound className="h-5 w-5" /></span><div><h2 className="font-semibold text-zinc-950">Contraseña</h2><p className="text-sm text-zinc-500">Actualizá tu clave usando la contraseña actual.</p></div></div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium text-zinc-700">Contraseña actual<Input name="currentPassword" type="password" required autoComplete="current-password" className="mt-1.5" /></label>
        <label className="text-sm font-medium text-zinc-700">Nueva contraseña<Input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className="mt-1.5" /></label>
        <label className="text-sm font-medium text-zinc-700">Confirmar contraseña<Input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className="mt-1.5" /></label>
      </div>
      <footer className="mt-6 flex justify-end"><Button disabled={savingPassword}><KeyRound className="mr-2 h-4 w-4" />{savingPassword ? 'Actualizando...' : 'Cambiar contraseña'}</Button></footer>
    </form>
  </section>;
}
