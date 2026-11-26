import { Routes } from '@angular/router';

import { conPermiso, sesionActiva } from './core/sesion';

export const routes: Routes = [
  {
    path: '',
    title: 'Cuadra · Rol de pagos Ecuador',
    loadComponent: () => import('./landing/landing').then((m) => m.Landing),
  },
  {
    path: 'entrar',
    title: 'Ingresar | Cuadra',
    loadComponent: () => import('./entrar/entrar').then((m) => m.Entrar),
  },
  {
    path: 'recuperar',
    title: 'Recuperar contraseña | Cuadra',
    loadComponent: () => import('./acceso/recuperar').then((m) => m.Recuperar),
  },
  {
    path: 'restablecer',
    title: 'Nueva contraseña | Cuadra',
    loadComponent: () => import('./acceso/restablecer').then((m) => m.Restablecer),
  },
  {
    path: 'verificar',
    title: 'Verificar correo | Cuadra',
    loadComponent: () => import('./acceso/verificar').then((m) => m.Verificar),
  },
  {
    path: 'registro',
    title: 'Registrar mi empresa | Cuadra',
    loadComponent: () => import('./registro/registro').then((m) => m.Registro),
  },
  {
    path: 'sistema',
    canActivate: [sesionActiva],
    loadComponent: () => import('./sistema/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio | Cuadra',
        loadComponent: () => import('./sistema/inicio/inicio').then((m) => m.Inicio),
      },
      {
        path: 'empleados',
        title: 'Empleados | Cuadra',
        loadComponent: () => import('./sistema/empleados/lista').then((m) => m.ListaEmpleados),
      },
      {
        path: 'empleados/nuevo',
        title: 'Nuevo empleado | Cuadra',
        loadComponent: () =>
          import('./sistema/empleados/formulario').then((m) => m.FormularioEmpleado),
      },
      {
        path: 'empleados/:id/editar',
        title: 'Editar empleado | Cuadra',
        loadComponent: () =>
          import('./sistema/empleados/formulario').then((m) => m.FormularioEmpleado),
      },
      {
        path: 'prestamos',
        title: 'Préstamos del IESS | Cuadra',
        loadComponent: () => import('./sistema/prestamos/prestamos').then((m) => m.Prestamos),
      },
      {
        path: 'vacaciones',
        title: 'Vacaciones | Cuadra',
        loadComponent: () => import('./sistema/vacaciones/vacaciones').then((m) => m.Vacaciones),
      },
      {
        path: 'liquidaciones',
        title: 'Liquidaciones | Cuadra',
        loadComponent: () => import('./sistema/liquidaciones/liquidaciones').then((m) => m.Liquidaciones),
      },
      {
        path: 'organico',
        title: 'Orgánico funcional | Cuadra',
        loadComponent: () => import('./sistema/organico/organico').then((m) => m.Organico),
      },
      {
        path: 'parametros',
        title: 'Parámetros | Cuadra',
        loadComponent: () => import('./sistema/parametros/parametros').then((m) => m.PaginaParametros),
      },
      {
        path: 'usuarios',
        title: 'Usuarios | Cuadra',
        canActivate: [conPermiso('usuarios')],
        loadComponent: () => import('./sistema/usuarios/usuarios').then((m) => m.Usuarios),
      },
      {
        path: 'cuenta',
        title: 'Cuenta | Cuadra',
        canActivate: [conPermiso('usuarios')],
        loadComponent: () => import('./sistema/cuenta/cuenta').then((m) => m.Cuenta),
      },
      {
        path: 'roles',
        title: 'Roles de pago | Cuadra',
        loadComponent: () => import('./sistema/roles/lista').then((m) => m.ListaRoles),
      },
      {
        path: 'roles/novedades/:anio/:mes',
        title: 'Novedades del mes | Cuadra',
        loadComponent: () => import('./sistema/roles/novedades').then((m) => m.NovedadesMes),
      },
      {
        path: 'roles/:id',
        title: 'Rol de pagos | Cuadra',
        loadComponent: () => import('./sistema/roles/detalle').then((m) => m.DetalleRol),
      },
      {
        path: 'roles/:id/boleta/:detalleId',
        title: 'Boleta | Cuadra',
        loadComponent: () => import('./sistema/roles/boleta').then((m) => m.Boleta),
      },
    ],
  },
  {
    path: '**',
    title: 'Página no encontrada | Cuadra',
    loadComponent: () => import('./no-encontrada/no-encontrada').then((m) => m.NoEncontrada),
  },
];
