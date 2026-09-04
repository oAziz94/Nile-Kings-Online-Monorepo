"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Folder, Plus, Pencil, Trash2 } from "lucide-react";

type Category = { id: string; name: string; slug: string; sortOrder: number; productCount: number };

export default function AdminCategoriesPage() {
  const [list, setList] = React.useState<Category[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editSlug, setEditSlug] = React.useState("");
  const [editSortOrder, setEditSortOrder] = React.useState(0);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const { toast } = useToast();

  const load = React.useCallback(() => {
    fetch("/api/admin/categories", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: Category[] }) => {
        if (json?.success && Array.isArray(json.data)) setList(json.data);
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => load(), [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "الاسم مطلوب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() || undefined }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم إنشاء الفئة" });
        setName("");
        setSlug("");
        setOpen(false);
        load();
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (c: Category) => {
    setEditId(c.id);
    setEditName(c.name);
    setEditSlug(c.slug);
    setEditSortOrder(c.sortOrder);
  };

  const closeEdit = () => {
    setEditId(null);
    setEditName("");
    setEditSlug("");
    setEditSortOrder(0);
  };

  const update = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId || !editName.trim()) {
      toast({ title: "الاسم مطلوب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/categories/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editName.trim(),
          slug: editSlug.trim() || undefined,
          sortOrder: editSortOrder,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم تحديث الفئة" });
        closeEdit();
        load();
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/categories/${deleteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم حذف الفئة" });
        setDeleteId(null);
        load();
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const categories = list ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="الفئات"
        description="تنظيم المنتجات في فئات بدون تصنيفات فرعية."
        actions={
        <>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl">
              <Plus className="h-4 w-4" />
              إضافة فئة
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={create}>
              <DialogHeader>
                <DialogTitle>فئة جديدة</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="cat-name">الاسم *</Label>
                  <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الفئة" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cat-slug">الرابط (slug)</Label>
                  <Input id="cat-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="اختياري" />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">إلغاء</Button>
                </DialogClose>
                <Button type="submit" disabled={saving}>{saving ? "جاري…" : "إنشاء"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editId} onOpenChange={(open) => !open && closeEdit()}>
          <DialogContent>
            <form onSubmit={update}>
              <DialogHeader>
                <DialogTitle>تعديل الفئة</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-cat-name">الاسم *</Label>
                  <Input
                    id="edit-cat-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="اسم الفئة"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-cat-slug">الرابط (slug)</Label>
                  <Input
                    id="edit-cat-slug"
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                    placeholder="اختياري"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-cat-sort">ترتيب العرض</Label>
                  <Input
                    id="edit-cat-sort"
                    type="number"
                    value={editSortOrder}
                    onChange={(e) => setEditSortOrder(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">إلغاء</Button>
                </DialogClose>
                <Button type="submit" disabled={saving}>{saving ? "جاري…" : "حفظ"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>حذف الفئة</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              هل أنت متأكد من حذف هذه الفئة؟ لا يمكن حذف فئة تحتوي على منتجات.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteId(null)}>
                إلغاء
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={doDelete}
                disabled={deleting}
              >
                {deleting ? "جاري الحذف…" : "حذف"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </>
        }
      />

      <PanelCard
        title="قائمة الفئات"
        icon={<Folder className="h-5 w-5 text-burgundy" />}
      >
          {categories.length === 0 ? (
            <EmptyState
              icon={<Folder className="h-12 w-12" />}
              title="لا توجد فئات"
              description="أضف فئة لتنظيم المنتجات."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>الاسم</TableHead>
                  <TableHead>الرابط</TableHead>
                  <TableHead>ترتيب</TableHead>
                  <TableHead>عدد المنتجات</TableHead>
                  <TableHead className="w-[120px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.slug}</TableCell>
                    <TableCell>{c.sortOrder}</TableCell>
                    <TableCell>{c.productCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(c)}
                          title="تعديل"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(c.id)}
                          title="حذف"
                          disabled={c.productCount > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
      </PanelCard>
    </div>
  );
}
