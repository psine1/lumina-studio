import { z } from "zod";
import { projectSchema } from "./schema";

export const campaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  projects: z.array(projectSchema).min(1),
  directionName: z.string().max(80).default(""),
  approach: z.string().default("Automático"),
  contentType: z.string().default("Campaña editorial"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Campaign = z.infer<typeof campaignSchema>;
export type CampaignInfo = Omit<Campaign, "projects">;

export function campaignInfo(campaign: Campaign): CampaignInfo {
  return {
    id: campaign.id, name: campaign.name, directionName: campaign.directionName,
    approach: campaign.approach, contentType: campaign.contentType,
    createdAt: campaign.createdAt, updatedAt: campaign.updatedAt,
  };
}

export function sortCampaigns(campaigns: Campaign[]) {
  return [...campaigns].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
