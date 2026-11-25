<?php

declare(strict_types=1);

namespace Lmp\LicenseManager;

use Shopware\Core\Framework\Plugin;
use Shopware\Core\Framework\Plugin\Context\InstallContext;
use Shopware\Core\Framework\Plugin\Context\UninstallContext;
use Shopware\Core\Framework\DataAbstractionLayer\EntityRepository;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Criteria;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Filter\EqualsFilter;

/**
 * LicenseManagerPro plugin for Shopware 6.
 *
 * Creates a custom field set on the order entity so the order subscriber
 * can record which line items already received a license (mint-once
 * guarantee). No other schema is created; all license data lives in the
 * License Manager Pro backend.
 */
class LicenseManagerPro extends Plugin
{
    public const CUSTOM_FIELD_SET_NAME = 'lmp_license_manager';
    public const CUSTOM_FIELD_LICENSES = 'lmp_licenses';

    public function install(InstallContext $context): void
    {
        parent::install($context);
        $this->createOrderCustomFieldSet($context);
    }

    public function uninstall(UninstallContext $context): void
    {
        parent::uninstall($context);
        if (!$context->keepUserData()) {
            $this->removeOrderCustomFieldSet($context);
        }
    }

    private function createOrderCustomFieldSet(InstallContext $context): void
    {
        /** @var EntityRepository $repository */
        $repository = $this->container->get('custom_field_set.repository');
        $existing = $repository->search(
            (new Criteria())->addFilter(new EqualsFilter('name', self::CUSTOM_FIELD_SET_NAME)),
            $context->getContext()
        );
        if ($existing->count() > 0) {
            return;
        }
        $repository->create([
            [
                'name' => self::CUSTOM_FIELD_SET_NAME,
                'config' => [
                    'label' => [
                        'en-GB' => 'License Manager Pro',
                        'de-DE' => 'License Manager Pro',
                    ],
                ],
                'customFields' => [
                    [
                        'name' => self::CUSTOM_FIELD_LICENSES,
                        'type' => 'text',
                        'config' => [
                            'label' => [
                                'en-GB' => 'Minted licenses (JSON: line item id to license id)',
                                'de-DE' => 'Erstellte Lizenzen (JSON: Zeilen-ID zu Lizenz-ID)',
                            ],
                            'componentName' => 'sw-field',
                            'customFieldType' => 'text',
                            'customFieldPosition' => 1,
                        ],
                    ],
                ],
                'relations' => [
                    ['entityName' => 'order'],
                ],
            ],
        ], $context->getContext());
    }

    private function removeOrderCustomFieldSet(UninstallContext $context): void
    {
        /** @var EntityRepository $repository */
        $repository = $this->container->get('custom_field_set.repository');
        $found = $repository->search(
            (new Criteria())->addFilter(new EqualsFilter('name', self::CUSTOM_FIELD_SET_NAME)),
            $context->getContext()
        );
        $ids = [];
        foreach ($found->getEntities() as $set) {
            $ids[] = ['id' => $set->getId()];
        }
        if ($ids !== []) {
            $repository->delete($ids, $context->getContext());
        }
    }
}
