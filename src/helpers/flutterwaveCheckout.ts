type FlutterwaveCustomer = {
  email: string;
  name?: string | null;
  phoneNumber?: string | null;
};

type FlutterwaveCustomizations = {
  title?: string;
  description?: string;
  logo?: string;
};

export type FlutterwaveCheckoutConfig = {
  amountNaira: number;
  currency?: string;
  customer: FlutterwaveCustomer;
  customizations?: FlutterwaveCustomizations;
  onClose?: () => void;
  onSuccess?: (data: unknown) => void;
  publicKey: string;
  redirectUrl?: string;
  txRef: string;
};

type FlutterwaveCheckoutHandler = (config: Record<string, unknown>) => void;

declare global {
  interface Window {
    FlutterwaveCheckout?: FlutterwaveCheckoutHandler;
  }
}

let flutterwaveScriptPromise: Promise<void> | null = null;

const loadFlutterwaveScript = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Flutterwave checkout can only run in a browser."));
  }

  if (window.FlutterwaveCheckout) {
    return Promise.resolve();
  }

  if (flutterwaveScriptPromise) {
    return flutterwaveScriptPromise;
  }

  flutterwaveScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.flutterwave.com/v3.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load Flutterwave checkout script."));
    document.body.appendChild(script);
  });

  return flutterwaveScriptPromise;
};

export const openFlutterwaveCheckout = async ({
  amountNaira,
  currency = "NGN",
  customer,
  customizations,
  onClose,
  onSuccess,
  publicKey,
  redirectUrl,
  txRef
}: FlutterwaveCheckoutConfig) => {
  await loadFlutterwaveScript();

  if (!window.FlutterwaveCheckout) {
    throw new Error("Flutterwave checkout is not available.");
  }

  const amount = Number(amountNaira);

  const checkoutPayload: Record<string, unknown> = {
    amount,
    callback: (data: unknown) => {
      onSuccess?.(data);
    },
    currency,
    customer: {
      email: customer.email,
      name: customer.name || undefined,
      phone_number: customer.phoneNumber || undefined
    },
    customizations: customizations
      ? {
          description: customizations.description,
          logo: customizations.logo,
          title: customizations.title
        }
      : undefined,
    onclose: () => {
      onClose?.();
    },
    payment_options: "card,banktransfer,ussd",
    public_key: publicKey,
    tx_ref: txRef
  };

  if (redirectUrl) {
    checkoutPayload.redirect_url = redirectUrl;
  }

  window.FlutterwaveCheckout(checkoutPayload);
};
