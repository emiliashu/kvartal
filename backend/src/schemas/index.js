const { z } = require("zod");

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const password = z.string()
  .min(8, "Пароль должен содержать не менее 8 символов")
  .max(128)
  .regex(/\p{Lu}/u, "Добавьте заглавную букву")
  .regex(/\p{Ll}/u, "Добавьте строчную букву")
  .regex(/\d/, "Добавьте цифру")
  .regex(/[^\p{L}\d]/u, "Добавьте специальный символ");
const optionalDate = z.preprocess(
  (value) => value === "" ? null : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
);
const direction = z.enum(["N", "E", "S", "W", "Север", "Восток", "Юг", "Запад"]);
const optionalNumber = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : Number(value),
  z.number().finite().nonnegative().optional()
);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password,
  birthDate: optionalDate
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128)
});

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: email.optional(),
  birthDate: optionalDate,
  phone: z.string().trim().max(20).nullable().optional(),
  avatarPath: z.string().trim().max(2_000_000).nullable().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required"
});

const listingFields = z.object({
  title: z.string().trim().min(3).max(150).optional(),
  description: z.string().trim().min(10).max(5000),
  kind: z.enum(["new", "secondary"]),
  price: z.coerce.number().positive().max(1_000_000_000),
  area: z.coerce.number().positive().max(10000),
  rooms: z.coerce.number().int().min(0).max(10),
  floor: z.coerce.number().int().min(0).max(200),
  totalFloors: z.coerce.number().int().min(1).max(200),
  district: z.string().trim().min(2).max(100),
  address: z.string().trim().min(3).max(500),
  parking: z.boolean().optional(),
  orientations: z.array(direction).min(1).max(4),
  photos: z.array(z.string().trim().min(1).max(2_000_000)).min(1).max(8).optional()
});

const listingBodySchema = listingFields
  .extend({
    photos: z.array(z.string().trim().min(1).max(2_000_000)).min(1).max(8)
  })
  .refine((value) => value.totalFloors >= value.floor, {
    message: "totalFloors must be greater than or equal to floor",
    path: ["totalFloors"]
  })
  .transform((value) => ({
    ...value,
    parking: value.parking ?? false
  }));

const listingUpdateSchema = listingFields.partial().refine(
  (value) => value.floor === undefined || value.totalFloors === undefined || value.totalFloors >= value.floor,
  {
    message: "totalFloors must be greater than or equal to floor",
    path: ["totalFloors"]
  }
);

const listingQuerySchema = z.object({
  query: z.string().trim().max(150).optional(),
  kind: z.enum(["new", "secondary"]).optional(),
  rooms: optionalNumber,
  district: z.string().trim().max(100).optional(),
  minPrice: optionalNumber,
  maxPrice: optionalNumber,
  minArea: optionalNumber,
  maxArea: optionalNumber,
  sort: z.enum(["match", "priceAsc", "priceDesc", "areaDesc", "newest"]).default("newest"),
  limit: optionalNumber
});

const moderationQuerySchema = z.object({
  status: z.enum(["pending", "published", "needs_fix", "rejected"]).default("pending")
});

const sellerReviewSchema = z.object({
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().default("")
});

const decisionSchema = z.object({
  decision: z.enum(["approved", "returned", "rejected"]),
  reason: z.string().trim().max(2000).optional()
});

const conversationSchema = z.object({
  listingId: z.coerce.number().int().positive()
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(5000)
});

const preferencesSchema = z.object({
  maxPrice: z.coerce.number().positive().nullable().optional(),
  minArea: z.coerce.number().nonnegative().nullable().optional(),
  rooms: z.array(z.coerce.number().int().min(0).max(10)).max(10).optional(),
  directions: z.array(direction).max(4).optional(),
  districts: z.array(z.string().trim().min(2).max(100)).max(50).optional()
});

module.exports = {
  registerSchema,
  loginSchema,
  updateUserSchema,
  listingBodySchema,
  listingUpdateSchema,
  listingQuerySchema,
  moderationQuerySchema,
  sellerReviewSchema,
  decisionSchema,
  conversationSchema,
  messageSchema,
  preferencesSchema
};
