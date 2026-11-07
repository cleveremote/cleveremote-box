import { Language } from '@framework/i18n/language';
import { AuthenticationResultModel, AuthenticationStatus } from '@process/domain/models/authentication-result.model';

// time(date) : heure locale (fuseau de la box) au format HH:MM
type AuthenticationMessage = (r: AuthenticationResultModel, time: (date: Date | null | undefined) => string) => string;

// Record complet : tsc impose un message pour chaque statut dans chaque langue
export const AUTHENTICATION_MESSAGES: Record<Language, Record<AuthenticationStatus, AuthenticationMessage>> = {
    [Language.FR]: {
        [AuthenticationStatus.SUCCESS]: () => 'Connexion réussie',
        [AuthenticationStatus.MISSING_PASSWORD]: () => 'Veuillez saisir votre mot de passe',
        [AuthenticationStatus.NOT_INITIALIZED]: () => 'Aucun identifiant configuré sur la box',
        [AuthenticationStatus.INVALID_CREDENTIALS]: (r) => `Identifiant ou mot de passe incorrect. Encore ${r.attemptsRemaining} tentative(s) avant blocage du compte`,
        [AuthenticationStatus.ACCOUNT_LOCKED]: (r, time) => `Compte bloqué après ${r.failedAttempts} tentatives échouées. Réessayez à ${time(r.lockedUntil)}`,
        [AuthenticationStatus.RECOVERY_CODE_SENT]: (r, time) => `Un code de récupération a été envoyé par e-mail. Il est valable jusqu'à ${time(r.codeExpiresAt)}`,
        [AuthenticationStatus.RECOVERY_UNAVAILABLE]: () => 'Récupération impossible : identifiant inconnu ou aucune adresse e-mail associée',
        [AuthenticationStatus.RECOVERY_MAIL_FAILED]: () => 'L\'envoi du code de récupération a échoué, veuillez réessayer',
        [AuthenticationStatus.RECOVERY_CODE_VALID]: () => 'Code valide, vous pouvez saisir votre nouveau mot de passe',
        [AuthenticationStatus.RECOVERY_CODE_INVALID]: (r) => `Code de récupération incorrect. Encore ${r.attemptsRemaining} tentative(s)`,
        [AuthenticationStatus.RECOVERY_CODE_EXPIRED]: () => 'Code de récupération expiré ou inexistant, demandez un nouveau code',
        [AuthenticationStatus.RECOVERY_CODE_TOO_MANY_ATTEMPTS]: () => 'Trop de tentatives : le code a été invalidé, demandez un nouveau code',
        [AuthenticationStatus.PASSWORD_RESET]: () => 'Mot de passe modifié avec succès',
        [AuthenticationStatus.PASSWORD_RESET_FAILED]: () => 'La modification du mot de passe a échoué',
        [AuthenticationStatus.ACCOUNT_NOT_FOUND]: () => 'Compte introuvable',
        [AuthenticationStatus.ACCOUNT_UPDATED]: () => 'Compte mis à jour avec succès',
        [AuthenticationStatus.ACCOUNT_UPDATE_FAILED]: () => 'La mise à jour du compte a échoué',
        [AuthenticationStatus.VERIFICATION_CODE_SENT]: (r, time) => `Un code de vérification a été envoyé par e-mail. Il est valable jusqu'à ${time(r.codeExpiresAt)}`,
        [AuthenticationStatus.VERIFICATION_UNAVAILABLE]: () => 'Vérification impossible : identifiant inconnu ou aucune adresse e-mail associée',
        [AuthenticationStatus.VERIFICATION_MAIL_FAILED]: () => 'L\'envoi du code de vérification a échoué, veuillez réessayer',
        [AuthenticationStatus.VERIFICATION_CODE_VALID]: () => 'Code de vérification valide',
        [AuthenticationStatus.VERIFICATION_CODE_INVALID]: (r) => `Code de vérification incorrect. Encore ${r.attemptsRemaining} tentative(s)`,
        [AuthenticationStatus.VERIFICATION_CODE_EXPIRED]: () => 'Code de vérification expiré ou inexistant, demandez un nouveau code',
        [AuthenticationStatus.VERIFICATION_CODE_TOO_MANY_ATTEMPTS]: () => 'Trop de tentatives : le code a été invalidé, demandez un nouveau code'
    },
    [Language.EN]: {
        [AuthenticationStatus.SUCCESS]: () => 'Login successful',
        [AuthenticationStatus.MISSING_PASSWORD]: () => 'Please enter your password',
        [AuthenticationStatus.NOT_INITIALIZED]: () => 'No credentials configured on the box',
        [AuthenticationStatus.INVALID_CREDENTIALS]: (r) => `Incorrect login or password. ${r.attemptsRemaining} attempt(s) left before the account is locked`,
        [AuthenticationStatus.ACCOUNT_LOCKED]: (r, time) => `Account locked after ${r.failedAttempts} failed attempts. Try again at ${time(r.lockedUntil)}`,
        [AuthenticationStatus.RECOVERY_CODE_SENT]: (r, time) => `A recovery code has been sent by email. It is valid until ${time(r.codeExpiresAt)}`,
        [AuthenticationStatus.RECOVERY_UNAVAILABLE]: () => 'Recovery unavailable: unknown login or no email address associated',
        [AuthenticationStatus.RECOVERY_MAIL_FAILED]: () => 'Sending the recovery code failed, please try again',
        [AuthenticationStatus.RECOVERY_CODE_VALID]: () => 'Valid code, you can now enter your new password',
        [AuthenticationStatus.RECOVERY_CODE_INVALID]: (r) => `Incorrect recovery code. ${r.attemptsRemaining} attempt(s) left`,
        [AuthenticationStatus.RECOVERY_CODE_EXPIRED]: () => 'Recovery code expired or missing, please request a new code',
        [AuthenticationStatus.RECOVERY_CODE_TOO_MANY_ATTEMPTS]: () => 'Too many attempts: the code has been invalidated, please request a new code',
        [AuthenticationStatus.PASSWORD_RESET]: () => 'Password changed successfully',
        [AuthenticationStatus.PASSWORD_RESET_FAILED]: () => 'Changing the password failed',
        [AuthenticationStatus.ACCOUNT_NOT_FOUND]: () => 'Account not found',
        [AuthenticationStatus.ACCOUNT_UPDATED]: () => 'Account updated successfully',
        [AuthenticationStatus.ACCOUNT_UPDATE_FAILED]: () => 'Updating the account failed',
        [AuthenticationStatus.VERIFICATION_CODE_SENT]: (r, time) => `A verification code has been sent by email. It is valid until ${time(r.codeExpiresAt)}`,
        [AuthenticationStatus.VERIFICATION_UNAVAILABLE]: () => 'Verification unavailable: unknown login or no email address associated',
        [AuthenticationStatus.VERIFICATION_MAIL_FAILED]: () => 'Sending the verification code failed, please try again',
        [AuthenticationStatus.VERIFICATION_CODE_VALID]: () => 'Verification code valid',
        [AuthenticationStatus.VERIFICATION_CODE_INVALID]: (r) => `Incorrect verification code. ${r.attemptsRemaining} attempt(s) left`,
        [AuthenticationStatus.VERIFICATION_CODE_EXPIRED]: () => 'Verification code expired or missing, please request a new code',
        [AuthenticationStatus.VERIFICATION_CODE_TOO_MANY_ATTEMPTS]: () => 'Too many attempts: the code has been invalidated, please request a new code'
    },
    [Language.AR]: {
        [AuthenticationStatus.SUCCESS]: () => 'تم تسجيل الدخول بنجاح',
        [AuthenticationStatus.MISSING_PASSWORD]: () => 'يرجى إدخال كلمة المرور',
        [AuthenticationStatus.NOT_INITIALIZED]: () => 'لا توجد بيانات اعتماد مهيأة على الجهاز',
        [AuthenticationStatus.INVALID_CREDENTIALS]: (r) => `اسم المستخدم أو كلمة المرور غير صحيحة. المحاولات المتبقية قبل قفل الحساب: ${r.attemptsRemaining}`,
        [AuthenticationStatus.ACCOUNT_LOCKED]: (r, time) => `تم قفل الحساب بعد ${r.failedAttempts} محاولات فاشلة. أعد المحاولة في الساعة ${time(r.lockedUntil)}`,
        [AuthenticationStatus.RECOVERY_CODE_SENT]: (r, time) => `تم إرسال رمز الاسترداد عبر البريد الإلكتروني. صالح حتى الساعة ${time(r.codeExpiresAt)}`,
        [AuthenticationStatus.RECOVERY_UNAVAILABLE]: () => 'الاسترداد غير ممكن: اسم مستخدم غير معروف أو لا يوجد بريد إلكتروني مرتبط',
        [AuthenticationStatus.RECOVERY_MAIL_FAILED]: () => 'فشل إرسال رمز الاسترداد، يرجى المحاولة مرة أخرى',
        [AuthenticationStatus.RECOVERY_CODE_VALID]: () => 'الرمز صالح، يمكنك إدخال كلمة المرور الجديدة',
        [AuthenticationStatus.RECOVERY_CODE_INVALID]: (r) => `رمز الاسترداد غير صحيح. المحاولات المتبقية: ${r.attemptsRemaining}`,
        [AuthenticationStatus.RECOVERY_CODE_EXPIRED]: () => 'رمز الاسترداد منتهي الصلاحية أو غير موجود، يرجى طلب رمز جديد',
        [AuthenticationStatus.RECOVERY_CODE_TOO_MANY_ATTEMPTS]: () => 'محاولات كثيرة جدًا: تم إلغاء الرمز، يرجى طلب رمز جديد',
        [AuthenticationStatus.PASSWORD_RESET]: () => 'تم تغيير كلمة المرور بنجاح',
        [AuthenticationStatus.PASSWORD_RESET_FAILED]: () => 'فشل تغيير كلمة المرور',
        [AuthenticationStatus.ACCOUNT_NOT_FOUND]: () => 'الحساب غير موجود',
        [AuthenticationStatus.ACCOUNT_UPDATED]: () => 'تم تحديث الحساب بنجاح',
        [AuthenticationStatus.ACCOUNT_UPDATE_FAILED]: () => 'فشل تحديث الحساب',
        [AuthenticationStatus.VERIFICATION_CODE_SENT]: (r, time) => `تم إرسال رمز التحقق عبر البريد الإلكتروني. صالح حتى الساعة ${time(r.codeExpiresAt)}`,
        [AuthenticationStatus.VERIFICATION_UNAVAILABLE]: () => 'التحقق غير ممكن: اسم مستخدم غير معروف أو لا يوجد بريد إلكتروني مرتبط',
        [AuthenticationStatus.VERIFICATION_MAIL_FAILED]: () => 'فشل إرسال رمز التحقق، يرجى المحاولة مرة أخرى',
        [AuthenticationStatus.VERIFICATION_CODE_VALID]: () => 'رمز التحقق صالح',
        [AuthenticationStatus.VERIFICATION_CODE_INVALID]: (r) => `رمز التحقق غير صحيح. المحاولات المتبقية: ${r.attemptsRemaining}`,
        [AuthenticationStatus.VERIFICATION_CODE_EXPIRED]: () => 'رمز التحقق منتهي الصلاحية أو غير موجود، يرجى طلب رمز جديد',
        [AuthenticationStatus.VERIFICATION_CODE_TOO_MANY_ATTEMPTS]: () => 'محاولات كثيرة جدًا: تم إلغاء الرمز، يرجى طلب رمز جديد'
    }
};

const LOCALES: Record<Language, string> = {
    [Language.FR]: 'fr-FR',
    [Language.EN]: 'en-GB',
    [Language.AR]: 'ar'
};

// heure HH:MM dans le fuseau de la box ; fuseau invalide : UTC
function FormatTime(date: Date | null | undefined, lang: Language, timeZone: string | undefined): string {
    if (!date) { return '?'; }
    const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    try {
        return new Intl.DateTimeFormat(LOCALES[lang], { ...options, timeZone }).format(date);
    } catch {
        return new Intl.DateTimeFormat(LOCALES[lang], { ...options, timeZone: 'UTC' }).format(date);
    }
}

// phrase lisible d'un résultat d'authentification ; langue absente ou inconnue : français
export function DescribeAuthentication(result: AuthenticationResultModel, lang: string | undefined, timeZone?: string): string {
    const language = AUTHENTICATION_MESSAGES[lang as Language] ? lang as Language : Language.FR;
    return AUTHENTICATION_MESSAGES[language][result.status](result, (date) => FormatTime(date, language, timeZone));
}
