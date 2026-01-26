import mongoose, { Document, Schema } from "mongoose";

export interface IPerformance extends Document {
  rating: number;
  completedShifts: number;
  onTimeRate: number;
  comebacks: number;
  upsellCaptureRate: number;
  aseCertifications: string[];
}

export interface ITeamMember extends Document {
  name: string;
  email: string;
  phone?: string;
  role: string;
  department:
    | "Service Bays"
    | "Diagnostics"
    | "Front Desk"
    | "Parts"
    | "Detail"
    | "Field Service"
    | "Management";
  status: "active" | "inactive" | "suspended";
  joinDate: Date;
  hourlyRate: number;
  availability: "Full-time" | "Part-time" | "Apprentice" | "On-call";
  skills: string[];
  performance?: IPerformance;
  certifications?: string[];
  toastId?: string;
  avatar?: string;
  lastLogin?: Date;
  userId?: string;
  createdBy?: string;
}

const performanceSchema = new Schema<IPerformance>({
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0,
  },
  completedShifts: {
    type: Number,
    default: 0,
  },
  onTimeRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  comebacks: {
    type: Number,
    default: 0,
  },
  upsellCaptureRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  aseCertifications: [
    {
      type: String,
      trim: true,
    },
  ],
});

const teamMemberSchema = new Schema<ITeamMember>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      required: true,
      enum: [
        "Service Bays",
        "Diagnostics",
        "Front Desk",
        "Parts",
        "Detail",
        "Field Service",
        "Management",
      ],
      default: "Service Bays",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    joinDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    hourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    availability: {
      type: String,
      enum: ["Full-time", "Part-time", "Apprentice", "On-call"],
      default: "Full-time",
    },
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    certifications: [
      {
        type: String,
        trim: true,
      },
    ],
    performance: {
      type: performanceSchema,
      default: () => ({}),
    },
    toastId: {
      type: String,
      unique: true,
      sparse: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

teamMemberSchema.index({ department: 1, status: 1 });
teamMemberSchema.index({ role: 1 });

try {
  teamMemberSchema.index(
    { name: "text", email: "text", role: "text", department: "text" },
    { name: "team_text", weights: { name: 10, role: 6, department: 4 } },
  );
} catch {}

export const TeamMember =
  mongoose.models.TeamMember ||
  mongoose.model<ITeamMember>("TeamMember", teamMemberSchema);
