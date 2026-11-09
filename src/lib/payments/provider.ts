import type { PaymentsEnv } from "./catalog";
export type VerifiedPayment = {
  payment_id: string;
  status: string;
  currency: string;
  total_amount: number;
  metadata: Record<string, unknown>;
  product_cart: { product_id: string; quantity: number }[];
  billing?: { country?: string | undefined } | undefined;
  checkout_session_id?: string | null | undefined;
  customer?: { email: string } | undefined;
  created_at?: string | undefined;
  refunds?:
    | {
        refund_id: string;
        status: string;
        amount?: number | null | undefined;
        currency?: string | null | undefined;
      }[]
    | undefined;
};
export interface PaymentProvider {
  environment: PaymentsEnv;
  validateProduct(id: string, cents: number): Promise<void>;
  checkout(input: {
    productId: string;
    orderId: string;
    returnUrl: string;
    cents?: number;
    /** Dodo basket only: quantity of the single $1 product and allocation metadata. */
    quantity?: number;
    metadata?: Record<string, string>;
    billing?: { firstName: string; lastName: string; emailId: string; addressCountry: string; addressStreet1: string; addressCity: string; addressState: string; addressPostalCode: string };
  }): Promise<{ sessionId: string; url: string; statusUrl?: string }>;
  checkoutStatus?(id: string): Promise<{ payment_id?: string | null | undefined; payment_status?: string | null | undefined }>;
  refundStatus?(id: string): Promise<{ refund_id: string; payment_id: string; status: string; amount?: number | null | undefined; currency?: string | null | undefined }>;
  payment(id: string, statusUrl?: string | null): Promise<VerifiedPayment>;
  refund(paymentId: string, orderId: string, partial?: { itemId: string; cents: number; reason: string }): Promise<{ refundId: string; status: string }>;
}
