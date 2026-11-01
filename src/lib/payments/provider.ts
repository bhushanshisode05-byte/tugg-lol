import type { PaymentsEnv } from "./catalog";
export type VerifiedPayment = {
  payment_id: string; status: string; currency: string; total_amount: number;
  metadata: Record<string, unknown>;
  product_cart: { product_id: string; quantity: number }[];
  billing?: { country?: string | undefined } | undefined;
};
export interface PaymentProvider {
  environment: PaymentsEnv;
  validateProduct(id: string, cents: number): Promise<void>;
  checkout(input: { productId: string; orderId: string; returnUrl: string }): Promise<{ sessionId: string; url: string }>;
  payment(id: string): Promise<VerifiedPayment>;
  refund(paymentId: string, orderId: string): Promise<{ refundId: string; status: string }>;
}