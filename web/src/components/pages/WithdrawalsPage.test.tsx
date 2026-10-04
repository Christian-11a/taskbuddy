import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {render, screen, within, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {WithdrawalsPage} from "./WithdrawalsPage";
import {ToastProvider} from "@/components/ui/Toast";
import * as services from "@/lib/services";
vi.mock("@/lib/services", () => ({getWithdrawals:vi.fn(),settleWithdrawal:vi.fn(),rejectWithdrawal:vi.fn()}));
vi.mock("@/hooks/useLiveTick", () => ({useLiveTick:() => 0}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia",vi.fn(() => ({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
  vi.mocked(services.getWithdrawals).mockResolvedValue({items:[{
    id:"w1",profileId:"p1",profileName:"Test Provider",amount:350,title:"Withdrawal",
    destination:"GCash test account",status:"pending",createdAt:"2026-10-04T00:00:00Z",reviewedAt:null,reviewNote:null,
  }],total:1});
  vi.mocked(services.settleWithdrawal).mockResolvedValue({id:"w1"} as Awaited<ReturnType<typeof services.settleWithdrawal>>);
});
afterEach(() => vi.unstubAllGlobals());
it("requires a payout reference before marking money as sent", async () => {
  const user = userEvent.setup();
  render(<ToastProvider><WithdrawalsPage /></ToastProvider>);
  await user.click(await screen.findByText("Test Provider"));
  await user.click(await screen.findByRole("button",{name:"Mark as paid"}));
  const dialog = screen.getByRole("alertdialog");
  const confirm = within(dialog).getByRole("button",{name:"Mark as paid"});
  expect(confirm).toBeDisabled();
  await user.type(within(dialog).getByPlaceholderText("GCash / bank reference"),"   ");
  expect(confirm).toBeDisabled();
  await user.type(within(dialog).getByPlaceholderText("GCash / bank reference"),"GC-001");
  expect(confirm).toBeEnabled();
  await user.click(confirm);
  await waitFor(() => expect(services.settleWithdrawal).toHaveBeenCalledWith("w1","   GC-001"));
});
