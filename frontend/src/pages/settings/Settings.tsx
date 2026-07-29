import { Building2, Palette, Code, Mail, MessageCircle, Phone, CreditCard, Users, Shield, Key } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

const settingsSections = [
  { icon: Building2, label: 'Organization', desc: 'Name, address, timezone' },
  { icon: Palette, label: 'Brand', desc: 'Logo, colors, fonts' },
  { icon: Code, label: 'Prompt Templates', desc: 'AI prompt customization' },
  { icon: Key, label: 'API Keys', desc: 'Connect external services' },
  { icon: Mail, label: 'Email Settings', desc: 'SMTP, templates' },
  { icon: MessageCircle, label: 'WhatsApp Settings', desc: 'Business API config' },
  { icon: Phone, label: 'Voice Settings', desc: 'AI caller configuration' },
  { icon: CreditCard, label: 'Billing', desc: 'Plan, usage, invoices' },
  { icon: Users, label: 'Users', desc: 'Team management' },
  { icon: Shield, label: 'Roles & Permissions', desc: 'Access control' },
]

export function Settings() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="flex gap-6">
          {/* Sidebar nav */}
          <div className="w-56 shrink-0">
            <div className="space-y-1">
              {settingsSections.map((s, i) => {
                const Icon = s.icon
                return (
                  <button
                    key={i}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5 ${
                      i === 0 ? 'bg-indigo-500/10 border border-indigo-500/20' : 'border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${i === 0 ? 'text-indigo-400' : 'text-white/35'}`} />
                    <div>
                      <p className={`text-xs font-medium ${i === 0 ? 'text-white/80' : 'text-white/50'}`}>{s.label}</p>
                      <p className="text-[10px] text-white/25">{s.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-5">
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-white mb-1">Organization Settings</h3>
              <p className="text-xs text-white/35 mb-6">Manage your organization profile and preferences</p>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">Organization Name</label>
                    <Input defaultValue="VSP Law Associates" />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">Industry</label>
                    <Input defaultValue="Legal Services" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">Website</label>
                    <Input defaultValue="https://vsplawassociates.com" />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">Timezone</label>
                    <Input defaultValue="America/Chicago (CST)" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Business Description</label>
                  <textarea
                    defaultValue="VSP Law Associates is a Dallas-based NRI legal services firm specializing in India property law, succession, POA, and NRI investment compliance."
                    className="w-full h-20 rounded-xl border border-white/[0.10] bg-white/5 px-3 py-2 text-sm text-white/70 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <Separator />
                <Button variant="gradient" size="sm">Save Changes</Button>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-sm font-semibold text-white mb-1">Plan & Billing</h3>
              <p className="text-xs text-white/35 mb-6">Your current plan and usage</p>

              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white">Pro Plan</p>
                      <Badge variant="default">Active</Badge>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">$299/month · Renews Aug 29, 2026</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs">Upgrade</Button>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'AI Credits Used', value: 8240, max: 10000 },
                  { label: 'Team Members', value: 4, max: 10 },
                  { label: 'Active Campaigns', value: 12, max: 50 },
                  { label: 'Contacts', value: 1284, max: 5000 },
                ].map((usage) => (
                  <div key={usage.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-white/40">{usage.label}</span>
                      <span className="text-xs text-white/55">{usage.value.toLocaleString()} / {usage.max.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                        style={{ width: `${(usage.value / usage.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-sm font-semibold text-white mb-1">API Keys</h3>
              <p className="text-xs text-white/35 mb-6">Connect your AI and marketing service providers</p>

              <div className="space-y-3">
                {[
                  { label: 'OpenAI API Key', placeholder: 'sk-...', connected: false },
                  { label: 'Anthropic API Key', placeholder: 'sk-ant-...', connected: false },
                  { label: 'Twilio Account SID', placeholder: 'AC...', connected: true },
                  { label: 'SendGrid API Key', placeholder: 'SG...', connected: true },
                  { label: 'Meta Business API', placeholder: 'Bearer ...', connected: false },
                ].map((key) => (
                  <div key={key.label} className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-white/40 mb-1 block">{key.label}</label>
                      <Input
                        type="password"
                        placeholder={key.placeholder}
                        defaultValue={key.connected ? '••••••••••••••••' : ''}
                        className="font-mono text-xs"
                      />
                    </div>
                    <Badge variant={key.connected ? 'success' : 'secondary'} className="mt-5 shrink-0">
                      {key.connected ? 'Connected' : 'Not set'}
                    </Badge>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-4">Save API Keys</Button>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
