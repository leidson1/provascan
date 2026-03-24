'use client'

import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { SidebarContent } from '@/components/sidebar'

interface HeaderProps {
  user: {
    nome: string
    email: string
  }
  currentPath: string
  title?: string
}

export function Header({ user, currentPath, title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-white px-4 lg:hidden">
      <Sheet>
        <SheetTrigger
          render={<Button variant="ghost" size="icon-sm" />}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Menu</span>
        </SheetTrigger>
        <SheetContent side="left" showCloseButton={false} className="w-64 p-0">
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <SidebarContent user={user} currentPath={currentPath} />
        </SheetContent>
      </Sheet>

      {title && (
        <h1 className="mx-auto text-sm font-semibold text-gray-900">
          {title}
        </h1>
      )}
    </header>
  )
}
