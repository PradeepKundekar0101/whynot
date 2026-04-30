export interface ShowFormState {
  title: string;
  date: string;
  time: string;
  repeats: "none" | "daily" | "weekly" | "monthly";
  primaryCategory: string;
  primarySubcategory: string;
  primarySellingFormat: "breaks" | "singles" | "surprise_sets";
  tags: string[];
  thumbnailUrl: string;
  videoPreviewUrl: string;
  freePickupEnabled: boolean;
  pickupAddressId: string;
  pickupInstructions: string;
  domesticShippingFee: string;
  combinedShippingEnabled: boolean;
  visibility: "public" | "private";
  notifyFollowers: boolean;
}

function defaultDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function defaultTime() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d.toTimeString().slice(0, 5);
}

export function makeDefaultShowFormState(): ShowFormState {
  return {
    title: "",
    date: defaultDate(),
    time: defaultTime(),
    repeats: "none",
    primaryCategory: "",
    primarySubcategory: "",
    primarySellingFormat: "breaks",
    tags: [],
    thumbnailUrl: "",
    videoPreviewUrl: "",
    freePickupEnabled: false,
    pickupAddressId: "",
    pickupInstructions: "",
    domesticShippingFee: "",
    combinedShippingEnabled: true,
    visibility: "public",
    notifyFollowers: true,
  };
}

export const SECTIONS = [
  { id: "show-info", label: "Show Information" },
  { id: "media", label: "Media" },
  { id: "shipping", label: "Shipping Settings" },
  { id: "visibility", label: "Visibility" },
  { id: "promote", label: "Promote Show" },
] as const;
