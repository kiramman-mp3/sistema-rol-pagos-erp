/**
 * Envío de correos (recuperar la contraseña, verificar el correo). No depende de un proveedor: usa SMTP,
 * que ofrecen todos (Resend, SendGrid, Brevo, Gmail, Amazon SES…).
 *
 *   CORREO_SMTP_URL     smtp://usuario:clave@servidor:587  (o smtps:// para el puerto 465)
 *   CORREO_REMITENTE    "Cuadra <no-responder@tu-dominio.com>"
 *
 * Sin esas variables el correo no sale: el mensaje se escribe en la consola del servidor, que sirve
 * para trabajar en local pero no para producción.
 */
import nodemailer from "nodemailer";

export interface Mensaje {
  para: string;
  asunto: string;
  texto: string;
}

export interface Correo {
  enviar(mensaje: Mensaje): Promise<void>;
}

/** Escribe el mensaje en la consola: para trabajar en local sin servidor de correo. */
export const correoEnConsola: Correo = {
  async enviar({ para, asunto, texto }) {
    console.log(`\n[correo] Para: ${para}\n[correo] Asunto: ${asunto}\n${texto}\n`);
  },
};

/** SMTP si el entorno lo configura; si no, la consola. Una configuración a medias es un error. */
export function correoDeEntorno(entorno: Record<string, string | undefined>): Correo & { real: boolean } {
  const url = entorno.CORREO_SMTP_URL?.trim();
  const remitente = entorno.CORREO_REMITENTE?.trim();
  if (!url && !remitente) return { ...correoEnConsola, real: false };
  if (!url || !remitente) throw new Error("Para enviar correos hacen falta CORREO_SMTP_URL y CORREO_REMITENTE.");
  const transporte = nodemailer.createTransport(url);
  return {
    real: true,
    async enviar({ para, asunto, texto }) {
      await transporte.sendMail({ from: remitente, to: para, subject: asunto, text: texto });
    },
  };
}
