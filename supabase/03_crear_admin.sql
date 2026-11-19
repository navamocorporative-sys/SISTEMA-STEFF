-- =====================================================================
--  SISTEMA STEFF — Crear la cuenta de administrador
--  1) Cambia la contraseña de abajo (mínimo 8 caracteres).
--  2) Ejecuta este archivo en Supabase > SQL Editor.
--  Para entrar al sistema usa:  Usuario: admin   Contraseña: la que pongas aquí.
-- =====================================================================

select public._steff_create_auth_user(
  'admin',                    -- usuario
  'CAMBIA-ESTA-CONTRASENA',   -- contraseña
  'Administrador',            -- nombre
  'admin'                     -- rol
);
