import { useEffect, useState } from 'react'
import { Building2, Palette, Code, Mail, MessageCircle, Phone, CreditCard, Users, Shield, Key } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { settingsApi } from '@/services/api'

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
  const [org, setOrg] = useState({ name: '', industry: '', website: '', timezone: '', description: '' })
  const [brand, setBrand] = useState({ primaryColor: '', tagline: '', voice: '' })
  const [apiKeys, setApiKeys] = useState({ openai: '', sendgrid: '', twilio: '', blandai: '', anthropic: '', meta: '' })
  const [billing, setBilling] = useState<any>({})
  const [savingOrg, setSavingOrg] = useState(false)
  const [savingKeys, setSavingKeys] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await settingsApi.get() as any
        const o = data?.organization || {}
        setOrg({
          name: o.name || '',
          industry: o.industry || '',
          website: o.website || '',
          timezone: o.timezone || '',
          description: o.description || 'VSP Law Associates is a Dallas-based NRI legal services firm specializing in India property law, succession, POA, and NRI investment compliance.',
        })
        const b = data?.brand || {}
        setBrand({
          primaryColor: b.primaryColor || '#6366f1',
          tagline: b.tagline || '',
          voice: b.voice || '',
        })
        const keys = data?.apiKeys || {}
        setApiKeys({
          openai: keys.openai || '',
          sendgrid: keys.sendgrid || '',
          twilio: keys.twilio || '',
          blandai: keys.blandai || '',
          anthropic: keys.anthropic || '',
          meta: keys.meta || '',
        })
        setBilling(data?.billing || {})
      } catch (err) {
        console.error(err)
      }
    }
    load()
  }, [])

  const handleSaveOrg = async () => {
    setSavingOrg(true)
    try {
      await settingsApi.updateOrganization({
        name: org.name,
        industry: org.industry,
        website: org.website,
        timezone: org.timezone,
        description: org.description,
      })
      await settingsApi.updateBrand({
        primaryColor: brand.primaryColor,
        tagline: brand.tagline,
        voice: brand.voice,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setSavingOrg(false)
    }
  }

  const handleSaveKeys = async () => {
    setSavingKeys(true)
    try {
      await settingsApi.updateApiKeys(apiKeys)
    } catch (err) {
      console.error(err)
    } finally {
      setSavingKeys(false)
    }
  }

  const keyFields = [
    { key: 'openai' as const, label: 'OpenAI API Key', placeholder: 'sk-...' },
    { key: 'anthropic' as const, label: 'Anthropic API Key', placeholder: 'sk-ant-...' },
    { key: 'twilio' as const, label: 'Twilio Account SID', placeholder: 'AC...' },
    { key: 'sendgrid' as const, label: 'SendGrid API Key', placeholder: 'SG...' },
    { key: 'meta' as const, label: 'Meta Business API', placeholder: 'Bearer ...' },
  ]

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
                    <Input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">Industry</label>
                    <Input value={org.industry} onChange={(e) => setOrg({ ...org, industry: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">Website</label>
                    <Input value={org.website} onChange={(e) => setOrg({ ...org, website: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">Timezone</label>
                    <Input value={org.timezone} onChange={(e) => setOrg({ ...org, timezone: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Business Description</label>
                  <textarea
                    value={org.description}
                    onChange={(e) => setOrg({ ...org, description: e.target.value })}
                    className="w-full h-20 rounded-xl border border-white/[0.10] bg-white/5 px-3 py-2 text-sm text-white/70 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">Brand Tagline</label>
                    <Input value={brand.tagline} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">Primary Color</label>
                    <Input value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} />
                  </div>
                </div>
                <Button variant="gradient" size="sm" onClick={handleSaveOrg} disabled={savingOrg}>
                  {savingOrg ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-sm font-semibold text-white mb-1">Plan & Billing</h3>
              <p className="text-xs text-white/35 mb-6">Your current plan and usage</p>

              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white">{billing.plan || 'Pro'} Plan</p>
                      <Badge variant="default">Active</Badge>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">
                      ${billing.amount ?? 299}/month · Renews {billing.renewsAt || 'Aug 29, 2026'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs">Upgrade</Button>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'AI Credits Used', value: 8240, max: 10000 },
                  { label: 'Team Members', value: Number(billing.seats || 4), max: 10 },
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
                {keyFields.map((key) => {
                  const connected = Boolean(apiKeys[key.key])
                  return (
                    <div key={key.label} className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-white/40 mb-1 block">{key.label}</label>
                        <Input
                          type="password"
                          placeholder={key.placeholder}
                          value={apiKeys[key.key]}
                          onChange={(e) => setApiKeys({ ...apiKeys, [key.key]: e.target.value })}
                          className="font-mono text-xs"
                        />
                      </div>
                      <Badge variant={connected ? 'success' : 'secondary'} className="mt-5 shrink-0">
                        {connected ? 'Connected' : 'Not set'}
                      </Badge>
                    </div>
                  )
                })}
              </div>
              <Button variant="outline" size="sm" className="mt-4" onClick={handleSaveKeys} disabled={savingKeys}>
                {savingKeys ? 'Saving...' : 'Save API Keys'}
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
