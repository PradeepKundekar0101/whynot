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
  isAdultContent: boolean;
  allowChatReplays: boolean;
  recordingEnabled: boolean;
  matureAudienceFilter: boolean;
  allowGuestCoHosts: boolean;
  boostEnabled: boolean;
  crossPostSocial: boolean;
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
    isAdultContent: false,
    allowChatReplays: true,
    recordingEnabled: false,
    matureAudienceFilter: false,
    allowGuestCoHosts: false,
    boostEnabled: false,
    crossPostSocial: false,
    notifyFollowers: true,
  };
}

export const SECTIONS = [
  { id: "show-info", label: "Show Information" },
  { id: "media", label: "Media" },
  { id: "shipping", label: "Shipping Settings" },
  { id: "content", label: "Content Settings" },
  { id: "options", label: "Show Options" },
  { id: "discovery", label: "Show Discovery" },
  { id: "promote", label: "Promote Show" },
] as const;
