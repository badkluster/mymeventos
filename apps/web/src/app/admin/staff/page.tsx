import { redirect } from 'next/navigation';

// Staff is a filtered view of the user directory. Keeping this route preserves
// old bookmarks while avoiding a second, divergent CRUD screen.
export default function StaffPage() {
  redirect('/admin/users?view=staff');
}
